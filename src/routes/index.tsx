import * as sound from "@/platform/audio";
import { triggerWakeAlert } from "@/platform/notifications";
import { STORAGE_KEYS, newId, readJson, removeKey, writeJson } from "@/platform/storage";
import { createFileRoute } from "@tanstack/react-router";
import {
  Bell,
  ChevronDown,
  Clock3,
  History,
  Home,
  Music2,
  Pause,
  Play,
  Settings2,
  Trash2,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import catImage from "@/assets/neko-nap-cat.png.asset.json";
import purrAudio from "@/assets/cat-purring.mp3.asset.json";
import rainAudio from "@/assets/rain-sound.mp3.asset.json";
import oceanAudio from "@/assets/ocean-waves.mp3.asset.json";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Neko Nap — 安静地睡一会儿" },
      {
        name: "description",
        content: "一只猫陪你安静小睡，醒来时从容衔接下一件事。",
      },
      { property: "og:title", content: "Neko Nap — 安静地睡一会儿" },
      {
        property: "og:description",
        content: "柔和、无压力的本地小睡计时器。",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: NekoNap,
});

type Outcome = "slept" | "restedAwake" | "couldNotRest" | "unknown";
type SoundKind = "purr" | "rain" | "ocean" | "silence" | "local";
type SessionStatus = "running" | "wake";

type NapSession = {
  startedAt: string;
  plannedWakeAt: string;
  plannedMinutes: number;
  nextThingLabel: string;
  nextThingAt: string;
  soundKind: SoundKind;
  status: SessionStatus;
};

type NapRecord = Omit<NapSession, "status"> & {
  id: string;
  actualEndedAt: string;
  outcome: Outcome;
  status: "ended" | "interrupted";
};

const STORAGE_SESSION = STORAGE_KEYS.session;
const STORAGE_RECORDS = STORAGE_KEYS.records;
const STORAGE_STATIC = STORAGE_KEYS.still;
const BUILT_IN_SOUNDS: Record<Exclude<SoundKind, "silence" | "local">, string> = {
  purr: purrAudio.url,
  rain: rainAudio.url,
  ocean: oceanAudio.url,
};

function safeRead<T>(key: string, fallback: T): T {
  return readJson(key, fallback);
}

function pad(value: number) {
  return String(value).padStart(2, "0");
}

function localInputValue(date: Date) {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function formatTime(value: string | Date) {
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function relativeTime(target: string, from = Date.now()) {
  const minutes = Math.round((new Date(target).getTime() - from) / 60_000);
  const absolute = Math.abs(minutes);
  if (absolute < 1) return "就是现在";
  const text = absolute >= 60 ? `${Math.floor(absolute / 60)} 小时 ${absolute % 60} 分钟` : `${absolute} 分钟`;
  return minutes > 0 ? `还有 ${text}` : `已过 ${text}`;
}

function Cat({ active = false, awake = false, still = false }: { active?: boolean; awake?: boolean; still?: boolean }) {
  return (
    <figure className={`cat-scene ${active ? "cat-active" : ""} ${still ? "cat-still" : ""}`} aria-label={awake ? "安静醒来的猫" : "蜷着睡觉的猫"} role="img">
      <img className="cat-image" src={catImage.url} alt="" draggable={false} />
      {active && <span className="cat-torso" aria-hidden="true"><img src={catImage.url} alt="" draggable={false} /></span>}
    </figure>
  );
}

function IconButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button className="icon-button" type="button" aria-label={label} title={label} onClick={onClick}>
      {children}
    </button>
  );
}

function NekoNap() {
  const [view, setView] = useState<"home" | "history">("home");
  const [session, setSession] = useState<NapSession | null>(null);
  const [records, setRecords] = useState<NapRecord[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [duration, setDuration] = useState(20);
  const [customDuration, setCustomDuration] = useState(60);
  const [custom, setCustom] = useState(false);
  const [nextEnabled, setNextEnabled] = useState(false);
  const [nextLabel, setNextLabel] = useState("出门");
  const [nextAt, setNextAt] = useState(() => localInputValue(new Date(Date.now() + 75 * 60_000)));
  const [soundKind, setSoundKind] = useState<SoundKind>("purr");
  const [volume, setVolume] = useState(35);
  const [localAudio, setLocalAudio] = useState<File | null>(null);
  const [audioPaused, setAudioPaused] = useState(false);
  const [showControls, setShowControls] = useState(false);
  const [still, setStill] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [showCheckIn, setShowCheckIn] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    setSession(safeRead<NapSession | null>(STORAGE_SESSION, null));
    setRecords(safeRead<NapRecord[]>(STORAGE_RECORDS, []));
    setStill(safeRead(STORAGE_STATIC, false));
    setHydrated(true);
  }, []);

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    if (session) writeJson(STORAGE_SESSION, session);
    else removeKey(STORAGE_SESSION);
  }, [session, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    writeJson(STORAGE_RECORDS, records);
  }, [records, hydrated]);

  useEffect(() => {
    if (!session || session.status !== "running") return;
    if (new Date(session.plannedWakeAt).getTime() <= now) {
      stopRestAudio();
      playWakeTone();
      setSession({ ...session, status: "wake" });
    }
  }, [now, session]);

  const actualDuration = custom ? Math.min(720, Math.max(1, customDuration || 1)) : duration;
  const wakeAt = useMemo(() => new Date(now + actualDuration * 60_000), [now, actualDuration]);
  const bufferMinutes = nextEnabled ? Math.round((new Date(nextAt).getTime() - wakeAt.getTime()) / 60_000) : null;

  function getAudioElement(kind: SoundKind = soundKind) {
    if (kind === "silence") return null;
    const source = kind === "local" ? (localAudio ? URL.createObjectURL(localAudio) : "") : BUILT_IN_SOUNDS[kind];
    const identity = kind === "local" ? localAudio?.name ?? "" : kind;
    if (!source) return null;
    if (!audioRef.current || audioRef.current.dataset["name"] !== identity) {
      audioRef.current?.pause();
      const audio = new Audio(source);
      audio.dataset["name"] = identity;
      audio.loop = true;
      audioRef.current = audio;
    }
    return audioRef.current;
  }

  function playWakeTone() {
    triggerWakeAlert();
  }

  function stopRestAudio() {
    sound.stopSound();
  }

  function startNap() {
    const startedAt = new Date();
    const plannedWakeAt = new Date(startedAt.getTime() + actualDuration * 60_000);
    const nextDate = nextEnabled ? new Date(nextAt) : null;
    setAudioPaused(false);
    setSession({
      startedAt: startedAt.toISOString(),
      plannedWakeAt: plannedWakeAt.toISOString(),
      plannedMinutes: actualDuration,
      nextThingLabel: nextEnabled ? nextLabel.trim() || "下一件事" : "",
      nextThingAt: nextDate && !Number.isNaN(nextDate.getTime()) ? nextDate.toISOString() : "",
      soundKind,
      status: "running",
    });
    const el = getAudioElement(soundKind);
    if (el) sound.playElement(el, volume);
    else sound.stopSound();
  }

  function finishNap(status: "ended" | "interrupted") {
    if (!session) return;
    stopRestAudio();
    const ended = new Date().toISOString();
    const record: NapRecord = {
      ...session,
      id: newId(),
      actualEndedAt: ended,
      outcome: "unknown",
      status,
    };
    setRecords((current) => [record, ...current]);
    setSession({ ...session, status: "wake" });
  }

  function saveOutcome(outcome: Outcome) {
    if (!session) return;
    setRecords((current) => {
      const existing = current.find((record) => record.startedAt === session.startedAt);
      if (existing) return current.map((record) => record.id === existing.id ? { ...record, outcome } : record);
      return [{ ...session, id: newId(), actualEndedAt: new Date().toISOString(), outcome, status: "ended" }, ...current];
    });
    setSession(null);
    setShowCheckIn(false);
    setView("history");
  }

  function toggleAudio() {
    if (audioPaused) {
      setAudioPaused(false);
      const el = session ? getAudioElement(session.soundKind) : null;
      if (el) sound.playElement(el, volume, false);
    } else {
      setAudioPaused(true);
      stopRestAudio();
    }
  }

  if (!hydrated) return <main className="app-shell" />;

  if (view === "history" && !session) {
    return <HistoryView records={records} onDelete={(id) => setRecords((items) => items.filter((item) => item.id !== id))} onHome={() => setView("home")} />;
  }

  if (session?.status === "running") {
    return (
      <main className="focus-screen">
        <header className="focus-header">
          <span className="wordmark">neko nap</span>
          <IconButton label="切换猫咪动画" onClick={() => {
            const value = !still;
            setStill(value);
            writeJson(STORAGE_STATIC, value);
          }}>{still ? <Play size={18} /> : <Pause size={18} />}</IconButton>
        </header>
        <section className="sleeping-stage">
          <Cat active still={still} />
          <div className="quiet-time">
            <span>醒来时间</span>
            <strong>{formatTime(session.plannedWakeAt)}</strong>
          </div>
          {session.nextThingAt && (
            <button className="next-thing-line" type="button" onClick={() => setShowControls((value) => !value)}>
              <span>{session.nextThingLabel} · {formatTime(session.nextThingAt)}</span>
              <ChevronDown size={17} className={showControls ? "rotate-180" : ""} />
            </button>
          )}
          <div className={`secondary-controls ${showControls ? "secondary-controls-open" : ""}`}>
            <button className="soft-control" type="button" onClick={toggleAudio}>
              {audioPaused ? <VolumeX size={18} /> : <Volume2 size={18} />}
              {audioPaused ? "继续声音" : "暂停声音"}
            </button>
            <button className="soft-control" type="button" onClick={() => finishNap("interrupted")}>
              <X size={18} /> 提前结束
            </button>
          </div>
        </section>
        {!showControls && (
          <button className="controls-handle" type="button" onClick={() => setShowControls(true)} aria-label="展开其他控制">
            <Settings2 size={18} />
          </button>
        )}
      </main>
    );
  }

  if (session?.status === "wake") {
    const eventText = session.nextThingAt ? relativeTime(session.nextThingAt, now) : "慢慢醒来就好";
    return (
      <main className="focus-screen wake-screen">
        <header className="focus-header"><span className="wordmark">neko nap</span></header>
        <section className="sleeping-stage wake-stage">
          <Cat awake still={still} />
          <div className="wake-copy">
            <p>醒啦</p>
            <h1>{session.nextThingAt ? `距离${session.nextThingLabel}${eventText}` : eventText}</h1>
            <span>不管有没有睡着，这段休息都算数。</span>
          </div>
          {!showCheckIn ? (
            <div className="wake-actions">
              <button className="primary-button" type="button" onClick={() => setShowCheckIn(true)}>我醒了</button>
              <button className="text-button" type="button" onClick={() => saveOutcome("unknown")}>稍后记录</button>
            </div>
          ) : (
            <div className="check-in animate-fade-in">
              <p>刚才感觉怎么样？</p>
              <button type="button" onClick={() => saveOutcome("slept")}>睡着了</button>
              <button type="button" onClick={() => saveOutcome("restedAwake")}>清醒地休息了</button>
              <button type="button" onClick={() => saveOutcome("couldNotRest")}>没休息下来</button>
              <button className="text-button" type="button" onClick={() => saveOutcome("unknown")}>跳过</button>
            </div>
          )}
        </section>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <header className="app-header">
        <div><span className="eyebrow">今天也辛苦了</span><h1>neko nap</h1></div>
        <Cat still />
      </header>

      <section className="setup-section" aria-labelledby="duration-title">
        <div className="section-heading"><span className="step-number">01</span><div><h2 id="duration-title">想休息多久？</h2><p>醒来时间 {formatTime(wakeAt)}</p></div></div>
        <div className="duration-grid">
          {[20, 45, 90].map((minutes) => (
            <button key={minutes} type="button" className={!custom && duration === minutes ? "duration-button duration-active" : "duration-button"} onClick={() => { setCustom(false); setDuration(minutes); }}>
              <strong>{minutes}</strong><span>分钟</span>
            </button>
          ))}
          <button type="button" className={custom ? "duration-button duration-active" : "duration-button"} onClick={() => setCustom(true)}><strong>···</strong><span>自定义</span></button>
        </div>
        {custom && <label className="field animate-fade-in"><span>分钟（1–720）</span><input type="number" min={1} max={720} value={customDuration} onChange={(event) => setCustomDuration(Number(event.target.value))} /></label>}
      </section>

      <section className="setup-section" aria-labelledby="event-title">
        <div className="section-heading section-heading-inline"><span className="step-number">02</span><div><h2 id="event-title">醒来之后</h2><p>可选</p></div><button type="button" className={`toggle ${nextEnabled ? "toggle-on" : ""}`} aria-pressed={nextEnabled} aria-label="添加下一件事" onClick={() => setNextEnabled((value) => !value)}><span /></button></div>
        {nextEnabled && (
          <div className="event-fields animate-fade-in">
            <label className="field"><span>下一件事</span><input value={nextLabel} maxLength={28} onChange={(event) => setNextLabel(event.target.value)} /></label>
            <label className="field"><span>时间</span><input type="datetime-local" value={nextAt} onChange={(event) => setNextAt(event.target.value)} /></label>
            {bufferMinutes !== null && (
              <div className={bufferMinutes < 30 ? "buffer-note buffer-warning" : "buffer-note"}>
                <Clock3 size={17} />
                {bufferMinutes < 0 ? "这件事在预计醒来之前" : bufferMinutes < 30 ? `醒来后只有 ${bufferMinutes} 分钟准备` : `醒来后有 ${bufferMinutes} 分钟准备`}
              </div>
            )}
          </div>
        )}
      </section>

      <section className="setup-section" aria-labelledby="sound-title">
        <div className="section-heading"><span className="step-number">03</span><div><h2 id="sound-title">陪睡声音</h2><p>只在此设备播放</p></div></div>
        <div className="sound-options">
          <button type="button" className={soundKind === "purr" ? "sound-choice selected" : "sound-choice"} onClick={() => setSoundKind("purr")}><span><Music2 size={18} />猫咪呼噜</span><i /></button>
          <button type="button" className={soundKind === "rain" ? "sound-choice selected" : "sound-choice"} onClick={() => setSoundKind("rain")}><span><Music2 size={18} />下雨声</span><i /></button>
          <button type="button" className={soundKind === "ocean" ? "sound-choice selected" : "sound-choice"} onClick={() => setSoundKind("ocean")}><span><Music2 size={18} />海浪声</span><i /></button>
          <button type="button" className={soundKind === "silence" ? "sound-choice selected" : "sound-choice"} onClick={() => setSoundKind("silence")}><span><VolumeX size={18} />安静</span><i /></button>
          <label className={soundKind === "local" ? "sound-choice selected file-choice" : "sound-choice file-choice"}><span><Music2 size={18} />{localAudio?.name || "选择本地音频"}</span><i /><input type="file" accept="audio/*" onChange={(event) => { const file = event.target.files?.[0]; if (file) { setLocalAudio(file); setSoundKind("local"); } }} /></label>
        </div>
        {soundKind !== "silence" && <label className="volume-control"><Volume2 size={18} /><input aria-label="音量" type="range" min={0} max={100} value={volume} onChange={(event) => { const v = Number(event.target.value); setVolume(v); sound.setVolume(v); }} onPointerUp={() => sound.preview("local", volume, getAudioElement())} /><span>{volume}%</span></label>}
        {soundKind !== "silence" && <button type="button" className="soft-control" onClick={() => sound.preview("local", volume, getAudioElement())}><Volume2 size={18} />试听 4 秒</button>}
        {soundKind !== "silence" && <p className="field-hint">听不到的话：检查手机侧边音量键和静音开关。</p>}
      </section>

      <aside className="reliability-note"><Bell size={18} /><p><strong>建议同时设置手机闹钟</strong><span>锁屏或切到别的应用后，网页声音可能无法准时响起。</span></p></aside>

      <button className="primary-button start-button" type="button" onClick={startNap}><span>开始 nap</span><span>{formatTime(wakeAt)} 醒来</span></button>

      <nav className="bottom-nav" aria-label="主导航">
        <button className="nav-active" type="button" onClick={() => setView("home")}><Home size={20} />小睡</button>
        <button type="button" onClick={() => setView("history")}><History size={20} />记录</button>
      </nav>
    </main>
  );
}

function HistoryView({ records, onDelete, onHome }: { records: NapRecord[]; onDelete: (id: string) => void; onHome: () => void }) {
  const known = records.filter((record) => record.outcome !== "unknown");
  const slept = known.filter((record) => record.outcome === "slept").length;
  return (
    <main className="app-shell history-screen">
      <header className="history-header"><div><span className="eyebrow">小睡日记</span><h1>最近的休息</h1></div><span className="history-count">{records.length} 次</span></header>
      {records.length === 0 ? (
        <div className="empty-history"><Cat still /><h2>还没有记录</h2><p>第一次 nap 结束后，会安静地记在这里。</p></div>
      ) : (
        <>
          <section className="record-list">
            {records.map((record) => {
              const actual = Math.max(1, Math.round((new Date(record.actualEndedAt).getTime() - new Date(record.startedAt).getTime()) / 60_000));
              const outcome = { slept: "睡着了", restedAwake: "清醒地休息了", couldNotRest: "没休息下来", unknown: "未记录感受" }[record.outcome];
              const soundLabel = { purr: "猫咪呼噜", rain: "下雨声", ocean: "海浪声", local: "本地音频", silence: "安静" }[record.soundKind];
              return <article className="record-row" key={record.id}><div className="record-date"><strong>{new Date(record.startedAt).getDate()}</strong><span>{new Intl.DateTimeFormat(undefined, { month: "short" }).format(new Date(record.startedAt))}</span></div><div className="record-main"><h2>{outcome}</h2><p>{formatDate(record.startedAt)} · {actual}/{record.plannedMinutes} 分钟</p><span>{soundLabel}{record.nextThingLabel ? ` · ${record.nextThingLabel}` : ""}</span></div><IconButton label="删除记录" onClick={() => onDelete(record.id)}><Trash2 size={17} /></IconButton></article>;
            })}
          </section>
          <section className="patterns"><span className="step-number">小结</span>{known.length < 5 ? <p>再记录 {5 - known.length} 次感受后，这里会显示简单的观察，不会评分。</p> : <p>在 {known.length} 次有感受记录的小睡里，你有 {Math.round((slept / known.length) * 100)}% 睡着了。这只是描述，不代表因果或健康建议。</p>}</section>
        </>
      )}
      <nav className="bottom-nav" aria-label="主导航"><button type="button" onClick={onHome}><Home size={20} />小睡</button><button className="nav-active" type="button"><History size={20} />记录</button></nav>
    </main>
  );
}

declare global {
  interface Window {
    webkitAudioContext?: typeof AudioContext;
  }
}