import * as sound from "@/platform/audio";
import { loadLocalAudio, saveLocalAudio } from "@/platform/local-audio";
import { triggerWakeAlert } from "@/platform/notifications";
import { STORAGE_KEYS, newId, readJson, removeKey, writeJson } from "@/platform/storage";
import { createFileRoute } from "@tanstack/react-router";
import {
  Bell,
  Check,
  ChevronDown,
  Clock3,
  Download,
  History,
  Home,
  Music2,
  Pause,
  Pencil,
  Play,
  Save,
  Settings2,
  Trash2,
  Upload,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

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

const NAP_FACTORS = [
  "本来就很困",
  "环境舒服",
  "声音有帮助",
  "脑子停不下来",
  "还不够困",
  "环境有干扰",
  "身体不舒服",
] as const;

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
  factors?: string[];
  note?: string;
};

type Preferences = {
  duration: number;
  customDuration: number;
  custom: boolean;
  nextEnabled: boolean;
  nextLabel: string;
  soundKind: SoundKind;
  volume: number;
};

type NekoNapBackup = {
  app: "neko-nap";
  version: 1;
  exportedAt: string;
  records: NapRecord[];
  preferences: Preferences;
  still?: boolean;
};

const STORAGE_SESSION = STORAGE_KEYS.session;
const STORAGE_RECORDS = STORAGE_KEYS.records;
const STORAGE_STATIC = STORAGE_KEYS.still;
const STORAGE_PREFERENCES = STORAGE_KEYS.preferences;
const assetUrl = (path: string) => `${import.meta.env.BASE_URL}${path}`;
const BUILT_IN_SOUNDS: Record<Exclude<SoundKind, "silence" | "local">, string> = {
  purr: assetUrl("assets/cat-purring.mp3"),
  rain: assetUrl("assets/rain-sound.mp3"),
  ocean: assetUrl("assets/ocean-waves.mp3"),
};
const OUTCOMES: Outcome[] = ["slept", "restedAwake", "couldNotRest", "unknown"];
const SOUND_KINDS: SoundKind[] = ["purr", "rain", "ocean", "silence", "local"];

function validDate(value: unknown) {
  return typeof value === "string" && value.length > 0 && Number.isFinite(Date.parse(value));
}

function validRecord(value: unknown): value is NapRecord {
  if (!value || typeof value !== "object") return false;
  const record = value as Partial<NapRecord>;
  const startedAt = validDate(record.startedAt) ? Date.parse(record.startedAt!) : Number.NaN;
  const plannedWakeAt = validDate(record.plannedWakeAt)
    ? Date.parse(record.plannedWakeAt!)
    : Number.NaN;
  const actualEndedAt = validDate(record.actualEndedAt)
    ? Date.parse(record.actualEndedAt!)
    : Number.NaN;
  return (
    typeof record.id === "string" &&
    record.id.trim().length > 0 &&
    record.id.length <= 200 &&
    Number.isFinite(startedAt) &&
    Number.isFinite(plannedWakeAt) &&
    Number.isFinite(actualEndedAt) &&
    plannedWakeAt >= startedAt &&
    actualEndedAt >= startedAt &&
    Number.isInteger(record.plannedMinutes) &&
    record.plannedMinutes! >= 1 &&
    record.plannedMinutes! <= 720 &&
    typeof record.nextThingLabel === "string" &&
    record.nextThingLabel.length <= 28 &&
    (record.nextThingAt === "" || validDate(record.nextThingAt)) &&
    SOUND_KINDS.includes(record.soundKind as SoundKind) &&
    OUTCOMES.includes(record.outcome as Outcome) &&
    ["ended", "interrupted"].includes(record.status ?? "") &&
    (record.factors === undefined ||
      (Array.isArray(record.factors) &&
        record.factors.length <= NAP_FACTORS.length &&
        record.factors.every((factor) => typeof factor === "string" && factor.length <= 100))) &&
    (record.note === undefined || (typeof record.note === "string" && record.note.length <= 500))
  );
}

function validPreferences(value: unknown): value is Preferences {
  if (!value || typeof value !== "object") return false;
  const preferences = value as Partial<Preferences>;
  return (
    Number.isInteger(preferences.duration) &&
    preferences.duration! >= 1 &&
    preferences.duration! <= 720 &&
    Number.isInteger(preferences.customDuration) &&
    preferences.customDuration! >= 1 &&
    preferences.customDuration! <= 720 &&
    typeof preferences.custom === "boolean" &&
    typeof preferences.nextEnabled === "boolean" &&
    typeof preferences.nextLabel === "string" &&
    preferences.nextLabel.length <= 28 &&
    SOUND_KINDS.includes(preferences.soundKind as SoundKind) &&
    Number.isFinite(preferences.volume) &&
    preferences.volume! >= 0 &&
    preferences.volume! <= 100
  );
}

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
  const text =
    absolute >= 60 ? `${Math.floor(absolute / 60)} 小时 ${absolute % 60} 分钟` : `${absolute} 分钟`;
  return minutes > 0 ? `还有 ${text}` : `已过 ${text}`;
}

function Cat({
  active = false,
  awake = false,
  still = false,
}: {
  active?: boolean;
  awake?: boolean;
  still?: boolean;
}) {
  return (
    <figure
      className={`cat-scene ${active ? "cat-active" : ""} ${awake ? "cat-awake" : ""} ${still ? "cat-still" : ""}`}
      aria-label={awake ? "安静醒来的猫" : "蜷着睡觉的猫"}
      role="img"
    >
      <img
        className="cat-image"
        src={assetUrl("assets/neko-nap-cat.png")}
        alt=""
        draggable={false}
      />
      {active && (
        <span className="cat-torso" aria-hidden="true">
          <img src={assetUrl("assets/neko-nap-cat.png")} alt="" draggable={false} />
        </span>
      )}
    </figure>
  );
}

function IconButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      className="icon-button"
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function StorageWarning({ message }: { message: string }) {
  if (!message) return null;
  return (
    <aside className="storage-warning" role="alert">
      <strong>这次更改没有成功保存在设备上</strong>
      <span>{message}</span>
    </aside>
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
  const [checkInOutcome, setCheckInOutcome] = useState<Outcome | null>(null);
  const [checkInFactors, setCheckInFactors] = useState<string[]>([]);
  const [checkInNote, setCheckInNote] = useState("");
  const [dataMessage, setDataMessage] = useState("");
  const [audioStorageMessage, setAudioStorageMessage] = useState("");
  const [storageMessage, setStorageMessage] = useState("");
  const audioRef = useRef<HTMLAudioElement | null>(null);

  function noteStorageResult(saved: boolean) {
    if (!saved)
      setStorageMessage(
        "请暂时保持页面开启，并尽快导出备份。无痕模式、浏览器权限或储存空间不足都可能导致记录丢失。",
      );
  }

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const restoredSession = safeRead<NapSession | null>(STORAGE_SESSION, null);
      const preferences = safeRead<Partial<Preferences>>(STORAGE_PREFERENCES, {});
      const restoredAudio = await loadLocalAudio().catch(() => null);
      if (cancelled) return;

      setSession(restoredSession);
      setRecords(safeRead<NapRecord[]>(STORAGE_RECORDS, []));
      setStill(safeRead(STORAGE_STATIC, false));
      setDuration(Math.min(720, Math.max(1, preferences.duration ?? 20)));
      setCustomDuration(Math.min(720, Math.max(1, preferences.customDuration ?? 60)));
      setCustom(preferences.custom ?? false);
      setNextEnabled(preferences.nextEnabled ?? false);
      setNextLabel(preferences.nextLabel || "出门");
      setVolume(Math.min(100, Math.max(0, preferences.volume ?? 35)));
      setLocalAudio(restoredAudio);
      setSoundKind(
        preferences.soundKind === "local" && !restoredAudio
          ? "purr"
          : (preferences.soundKind ?? "purr"),
      );

      // Browsers block autoplay after a reload. Make that state explicit and expose
      // the resume control instead of pretending the saved sound is still playing.
      if (restoredSession?.status === "running") {
        setAudioPaused(true);
        setShowControls(true);
      }
      setHydrated(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    noteStorageResult(session ? writeJson(STORAGE_SESSION, session) : removeKey(STORAGE_SESSION));
  }, [session, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    noteStorageResult(writeJson(STORAGE_RECORDS, records));
  }, [records, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    noteStorageResult(writeJson(STORAGE_STATIC, still));
  }, [hydrated, still]);

  useEffect(() => {
    if (!hydrated) return;
    const preferences: Preferences = {
      duration,
      customDuration,
      custom,
      nextEnabled,
      nextLabel,
      soundKind,
      volume,
    };
    noteStorageResult(writeJson(STORAGE_PREFERENCES, preferences));
  }, [custom, customDuration, duration, hydrated, nextEnabled, nextLabel, soundKind, volume]);

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
  const bufferMinutes = nextEnabled
    ? Math.round((new Date(nextAt).getTime() - wakeAt.getTime()) / 60_000)
    : null;

  function currentPreferences(): Preferences {
    return {
      duration,
      customDuration,
      custom,
      nextEnabled,
      nextLabel,
      soundKind,
      volume,
    };
  }

  function exportBackup() {
    const backup: NekoNapBackup = {
      app: "neko-nap",
      version: 1,
      exportedAt: new Date().toISOString(),
      records,
      preferences: currentPreferences(),
      still,
    };
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `neko-nap-backup-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    setDataMessage(`已导出 ${records.length} 条记录。自选音频不会写入备份。`);
  }

  async function importBackup(file: File) {
    try {
      const parsed = JSON.parse(await file.text()) as Partial<NekoNapBackup>;
      if (parsed.app !== "neko-nap" || parsed.version !== 1 || !Array.isArray(parsed.records))
        throw new Error("这不是 Neko Nap v1 备份");
      const imported = parsed.records.filter(validRecord);
      if (imported.length !== parsed.records.length) throw new Error("备份中有无法识别的记录");
      if (parsed.preferences !== undefined && !validPreferences(parsed.preferences))
        throw new Error("备份中的设置格式不正确");
      if (parsed.still !== undefined && typeof parsed.still !== "boolean")
        throw new Error("备份中的动画设置格式不正确");
      if (
        !window.confirm(
          `将导入 ${imported.length} 条记录。相同 ID 的记录会以备份版本为准，其余记录会保留。继续吗？`,
        )
      )
        return;

      setRecords((current) => {
        const merged = new Map(current.map((record) => [record.id, record]));
        imported.forEach((record) => merged.set(record.id, record));
        return [...merged.values()].sort(
          (a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime(),
        );
      });

      const preferences = parsed.preferences;
      if (preferences) {
        setDuration(preferences.duration);
        setCustomDuration(preferences.customDuration);
        setCustom(preferences.custom);
        setNextEnabled(preferences.nextEnabled);
        setNextLabel(preferences.nextLabel);
        setVolume(preferences.volume);
        setSoundKind(
          preferences.soundKind === "local" && !localAudio ? "purr" : preferences.soundKind,
        );
      }
      if (typeof parsed.still === "boolean") setStill(parsed.still);
      setDataMessage(`导入完成：已读取 ${imported.length} 条记录。`);
    } catch (error) {
      setDataMessage(error instanceof Error ? `无法导入：${error.message}` : "无法读取这个备份。");
    }
  }

  function getAudioElement(kind: SoundKind = soundKind) {
    if (kind === "silence") return null;
    const source =
      kind === "local"
        ? localAudio
          ? URL.createObjectURL(localAudio)
          : ""
        : BUILT_IN_SOUNDS[kind];
    const identity =
      kind === "local"
        ? `${localAudio?.name ?? ""}:${localAudio?.size ?? 0}:${localAudio?.lastModified ?? 0}`
        : kind;
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

  function saveOutcome(outcome: Outcome, factors: string[] = [], note = "") {
    if (!session) return;
    setRecords((current) => {
      const existing = current.find((record) => record.startedAt === session.startedAt);
      if (existing)
        return current.map((record) =>
          record.id === existing.id ? { ...record, outcome, factors, note: note.trim() } : record,
        );
      return [
        {
          ...session,
          id: newId(),
          actualEndedAt: new Date().toISOString(),
          outcome,
          status: "ended",
          factors,
          note: note.trim(),
        },
        ...current,
      ];
    });
    setSession(null);
    setShowCheckIn(false);
    setCheckInOutcome(null);
    setCheckInFactors([]);
    setCheckInNote("");
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
    return (
      <HistoryView
        records={records}
        onDelete={(id) => setRecords((items) => items.filter((item) => item.id !== id))}
        onUpdate={(updated) =>
          setRecords((items) => items.map((item) => (item.id === updated.id ? updated : item)))
        }
        onExport={exportBackup}
        onImport={importBackup}
        dataMessage={dataMessage}
        storageMessage={storageMessage}
        onHome={() => setView("home")}
      />
    );
  }

  if (session?.status === "running") {
    return (
      <main className="focus-screen">
        <header className="focus-header">
          <span className="wordmark">neko nap</span>
          <IconButton
            label="切换猫咪动画"
            onClick={() => {
              setStill((value) => !value);
            }}
          >
            {still ? <Play size={18} /> : <Pause size={18} />}
          </IconButton>
        </header>
        <StorageWarning message={storageMessage} />
        <section className="sleeping-stage">
          <Cat active still={still} />
          <div className="quiet-time">
            <span>醒来时间</span>
            <strong>{formatTime(session.plannedWakeAt)}</strong>
          </div>
          {session.nextThingAt && (
            <button
              className="next-thing-line"
              type="button"
              aria-expanded={showControls}
              onClick={() => setShowControls((value) => !value)}
            >
              <span>
                {session.nextThingLabel} · {formatTime(session.nextThingAt)}
              </span>
              <ChevronDown size={17} className={showControls ? "rotate-180" : ""} />
            </button>
          )}
          {showControls && (
            <div className="secondary-controls secondary-controls-open">
              <button className="soft-control" type="button" onClick={toggleAudio}>
                {audioPaused ? <VolumeX size={18} /> : <Volume2 size={18} />}
                {audioPaused ? "继续声音" : "暂停声音"}
              </button>
              <button
                className="soft-control"
                type="button"
                onClick={() => finishNap("interrupted")}
              >
                <X size={18} /> 提前结束
              </button>
            </div>
          )}
        </section>
        {!showControls && (
          <button
            className="controls-handle"
            type="button"
            onClick={() => setShowControls(true)}
            aria-label="展开其他控制"
            aria-expanded={false}
          >
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
        <header className="focus-header">
          <span className="wordmark">neko nap</span>
        </header>
        <StorageWarning message={storageMessage} />
        <section className="sleeping-stage wake-stage">
          <Cat awake still={still} />
          <div className="wake-copy">
            <p>醒啦</p>
            <h1>{session.nextThingAt ? `距离${session.nextThingLabel}${eventText}` : eventText}</h1>
            <span>不管有没有睡着，这段休息都算数。</span>
          </div>
          {!showCheckIn ? (
            <div className="wake-actions">
              <button className="primary-button" type="button" onClick={() => setShowCheckIn(true)}>
                我醒了
              </button>
              <button className="text-button" type="button" onClick={() => saveOutcome("unknown")}>
                稍后记录
              </button>
            </div>
          ) : (
            <div className="check-in animate-fade-in">
              <p>刚才感觉怎么样？</p>
              <button
                className={checkInOutcome === "slept" ? "check-choice-selected" : ""}
                type="button"
                onClick={() => setCheckInOutcome("slept")}
              >
                睡着了
              </button>
              <button
                className={checkInOutcome === "restedAwake" ? "check-choice-selected" : ""}
                type="button"
                onClick={() => setCheckInOutcome("restedAwake")}
              >
                清醒地休息了
              </button>
              <button
                className={checkInOutcome === "couldNotRest" ? "check-choice-selected" : ""}
                type="button"
                onClick={() => setCheckInOutcome("couldNotRest")}
              >
                没休息下来
              </button>
              <div className="check-in-details">
                <span>有什么影响了这次休息？（可选）</span>
                <FactorPicker selected={checkInFactors} onChange={setCheckInFactors} />
                <label className="field">
                  <span>随手记一点（可选）</span>
                  <textarea
                    rows={3}
                    maxLength={500}
                    value={checkInNote}
                    placeholder="例如：楼上有声音，但猫呼噜很有帮助"
                    onChange={(event) => setCheckInNote(event.target.value)}
                  />
                </label>
              </div>
              <button
                className="primary-button check-in-save"
                type="button"
                disabled={!checkInOutcome}
                onClick={() =>
                  checkInOutcome && saveOutcome(checkInOutcome, checkInFactors, checkInNote)
                }
              >
                <Save size={17} /> 保存记录
              </button>
              <button className="text-button" type="button" onClick={() => saveOutcome("unknown")}>
                跳过
              </button>
            </div>
          )}
        </section>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <header className="app-header">
        <div>
          <span className="eyebrow">今天也辛苦了</span>
          <h1>neko nap</h1>
        </div>
        <Cat still />
      </header>
      <StorageWarning message={storageMessage} />

      <section className="setup-section" aria-labelledby="duration-title">
        <div className="section-heading">
          <span className="step-number">01</span>
          <div>
            <h2 id="duration-title">想休息多久？</h2>
            <p>醒来时间 {formatTime(wakeAt)}</p>
          </div>
        </div>
        <div className="duration-grid">
          {[20, 45, 90].map((minutes) => (
            <button
              key={minutes}
              type="button"
              className={
                !custom && duration === minutes
                  ? "duration-button duration-active"
                  : "duration-button"
              }
              onClick={() => {
                setCustom(false);
                setDuration(minutes);
              }}
            >
              <strong>{minutes}</strong>
              <span>分钟</span>
            </button>
          ))}
          <button
            type="button"
            className={custom ? "duration-button duration-active" : "duration-button"}
            onClick={() => setCustom(true)}
          >
            <strong>···</strong>
            <span>自定义</span>
          </button>
        </div>
        {custom && (
          <label className="field animate-fade-in">
            <span>分钟（1–720）</span>
            <input
              type="number"
              min={1}
              max={720}
              value={customDuration}
              onChange={(event) => setCustomDuration(Number(event.target.value))}
            />
          </label>
        )}
      </section>

      <section className="setup-section" aria-labelledby="event-title">
        <div className="section-heading section-heading-inline">
          <span className="step-number">02</span>
          <div>
            <h2 id="event-title">醒来之后</h2>
            <p>可选</p>
          </div>
          <button
            type="button"
            className={`toggle ${nextEnabled ? "toggle-on" : ""}`}
            aria-pressed={nextEnabled}
            aria-label="添加下一件事"
            onClick={() => setNextEnabled((value) => !value)}
          >
            <span />
          </button>
        </div>
        {nextEnabled && (
          <div className="event-fields animate-fade-in">
            <label className="field">
              <span>下一件事</span>
              <input
                value={nextLabel}
                maxLength={28}
                onChange={(event) => setNextLabel(event.target.value)}
              />
            </label>
            <label className="field">
              <span>时间</span>
              <input
                type="datetime-local"
                value={nextAt}
                onChange={(event) => setNextAt(event.target.value)}
              />
            </label>
            {bufferMinutes !== null && (
              <div className={bufferMinutes < 30 ? "buffer-note buffer-warning" : "buffer-note"}>
                <Clock3 size={17} />
                {bufferMinutes < 0
                  ? "这件事在预计醒来之前"
                  : bufferMinutes < 30
                    ? `醒来后只有 ${bufferMinutes} 分钟准备`
                    : `醒来后有 ${bufferMinutes} 分钟准备`}
              </div>
            )}
          </div>
        )}
      </section>

      <section className="setup-section" aria-labelledby="sound-title">
        <div className="section-heading">
          <span className="step-number">03</span>
          <div>
            <h2 id="sound-title">陪睡声音</h2>
            <p>只在此设备播放</p>
          </div>
        </div>
        <div className="sound-options">
          <button
            type="button"
            className={soundKind === "purr" ? "sound-choice selected" : "sound-choice"}
            onClick={() => setSoundKind("purr")}
          >
            <span>
              <Music2 size={18} />
              猫咪呼噜
            </span>
            <i />
          </button>
          <button
            type="button"
            className={soundKind === "rain" ? "sound-choice selected" : "sound-choice"}
            onClick={() => setSoundKind("rain")}
          >
            <span>
              <Music2 size={18} />
              下雨声
            </span>
            <i />
          </button>
          <button
            type="button"
            className={soundKind === "ocean" ? "sound-choice selected" : "sound-choice"}
            onClick={() => setSoundKind("ocean")}
          >
            <span>
              <Music2 size={18} />
              海浪声
            </span>
            <i />
          </button>
          <button
            type="button"
            className={soundKind === "silence" ? "sound-choice selected" : "sound-choice"}
            onClick={() => setSoundKind("silence")}
          >
            <span>
              <VolumeX size={18} />
              安静
            </span>
            <i />
          </button>
          <label
            className={
              soundKind === "local"
                ? "sound-choice selected file-choice"
                : "sound-choice file-choice"
            }
          >
            <span>
              <Music2 size={18} />
              {localAudio?.name || "选择本地音频"}
            </span>
            <i />
            <input
              type="file"
              accept="audio/*"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) {
                  setLocalAudio(file);
                  setSoundKind("local");
                  setAudioStorageMessage("正在保存到这台设备…");
                  void saveLocalAudio(file)
                    .then(() => setAudioStorageMessage("已保存在这台设备，下次打开仍可使用。"))
                    .catch(() =>
                      setAudioStorageMessage("浏览器空间不足，音频仅在本次打开期间可用。"),
                    );
                }
              }}
            />
          </label>
        </div>
        {audioStorageMessage && <p className="field-hint">{audioStorageMessage}</p>}
        {soundKind !== "silence" && (
          <label className="volume-control">
            <Volume2 size={18} />
            <input
              aria-label="音量"
              type="range"
              min={0}
              max={100}
              value={volume}
              onChange={(event) => {
                const v = Number(event.target.value);
                setVolume(v);
                sound.setVolume(v);
              }}
              onPointerUp={() => sound.preview("local", volume, getAudioElement())}
            />
            <span>{volume}%</span>
          </label>
        )}
        {soundKind !== "silence" && (
          <button
            type="button"
            className="soft-control"
            onClick={() => sound.preview("local", volume, getAudioElement())}
          >
            <Volume2 size={18} />
            试听 4 秒
          </button>
        )}
        {soundKind !== "silence" && (
          <p className="field-hint">听不到的话：检查手机侧边音量键和静音开关。</p>
        )}
      </section>

      <aside className="reliability-note">
        <Bell size={18} />
        <p>
          <strong>建议同时设置手机闹钟</strong>
          <span>锁屏或切到别的应用后，网页声音可能无法准时响起。</span>
        </p>
      </aside>

      <button className="primary-button start-button" type="button" onClick={startNap}>
        <span>开始 nap</span>
        <span>{formatTime(wakeAt)} 醒来</span>
      </button>

      <nav className="bottom-nav" aria-label="主导航">
        <button className="nav-active" type="button" onClick={() => setView("home")}>
          <Home size={20} />
          小睡
        </button>
        <button type="button" onClick={() => setView("history")}>
          <History size={20} />
          记录
        </button>
      </nav>
    </main>
  );
}

function FactorPicker({
  selected,
  onChange,
}: {
  selected: string[];
  onChange: (factors: string[]) => void;
}) {
  return (
    <div className="factor-picker">
      {NAP_FACTORS.map((factor) => {
        const active = selected.includes(factor);
        return (
          <button
            key={factor}
            className={active ? "factor-chip factor-chip-selected" : "factor-chip"}
            type="button"
            aria-pressed={active}
            onClick={() =>
              onChange(active ? selected.filter((item) => item !== factor) : [...selected, factor])
            }
          >
            {active && <Check size={13} />}
            {factor}
          </button>
        );
      })}
    </div>
  );
}

function HistoryView({
  records,
  onDelete,
  onUpdate,
  onExport,
  onImport,
  dataMessage,
  storageMessage,
  onHome,
}: {
  records: NapRecord[];
  onDelete: (id: string) => void;
  onUpdate: (record: NapRecord) => void;
  onExport: () => void;
  onImport: (file: File) => Promise<void>;
  dataMessage: string;
  storageMessage: string;
  onHome: () => void;
}) {
  const [editing, setEditing] = useState<NapRecord | null>(null);
  const known = records.filter((record) => record.outcome !== "unknown");
  const slept = known.filter((record) => record.outcome === "slept").length;
  const factorCounts = records
    .flatMap((record) => record.factors ?? [])
    .reduce<Record<string, number>>((counts, factor) => {
      counts[factor] = (counts[factor] ?? 0) + 1;
      return counts;
    }, {});
  const topFactor = Object.entries(factorCounts).sort((a, b) => b[1] - a[1])[0];
  return (
    <main className="app-shell history-screen">
      <header className="history-header">
        <div>
          <span className="eyebrow">小睡日记</span>
          <h1>最近的休息</h1>
        </div>
        <span className="history-count">{records.length} 次</span>
      </header>
      <StorageWarning message={storageMessage} />
      <section className="data-tools" aria-label="备份与恢复">
        <button className="soft-control" type="button" onClick={onExport}>
          <Download size={17} /> 导出备份
        </button>
        <label className="soft-control import-control">
          <Upload size={17} /> 导入备份
          <input
            type="file"
            accept="application/json,.json"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void onImport(file);
              event.currentTarget.value = "";
            }}
          />
        </label>
      </section>
      {dataMessage && <p className="data-message">{dataMessage}</p>}
      {records.length === 0 ? (
        <div className="empty-history">
          <Cat still />
          <h2>还没有记录</h2>
          <p>第一次 nap 结束后，会安静地记在这里。</p>
        </div>
      ) : (
        <>
          <section className="record-list">
            {records.map((record) => {
              const actual = Math.max(
                1,
                Math.round(
                  (new Date(record.actualEndedAt).getTime() -
                    new Date(record.startedAt).getTime()) /
                    60_000,
                ),
              );
              const outcome = {
                slept: "睡着了",
                restedAwake: "清醒地休息了",
                couldNotRest: "没休息下来",
                unknown: "未记录感受",
              }[record.outcome];
              const soundLabel = {
                purr: "猫咪呼噜",
                rain: "下雨声",
                ocean: "海浪声",
                local: "本地音频",
                silence: "安静",
              }[record.soundKind];
              return (
                <div className="record-block" key={record.id}>
                  <article className="record-row">
                    <div className="record-date">
                      <strong>{new Date(record.startedAt).getDate()}</strong>
                      <span>
                        {new Intl.DateTimeFormat(undefined, { month: "short" }).format(
                          new Date(record.startedAt),
                        )}
                      </span>
                    </div>
                    <div className="record-main">
                      <h2>{outcome}</h2>
                      <p>
                        {formatDate(record.startedAt)} · {actual}/{record.plannedMinutes} 分钟
                      </p>
                      <span>
                        {soundLabel}
                        {record.nextThingLabel ? ` · ${record.nextThingLabel}` : ""}
                      </span>
                      {(record.factors?.length ?? 0) > 0 && (
                        <span className="record-factors">{record.factors!.join(" · ")}</span>
                      )}
                      {record.note && <span className="record-note">{record.note}</span>}
                    </div>
                    <div className="record-actions">
                      <IconButton
                        label="编辑记录"
                        onClick={() => setEditing(editing?.id === record.id ? null : { ...record })}
                      >
                        <Pencil size={16} />
                      </IconButton>
                      <IconButton
                        label="删除记录"
                        onClick={() => {
                          if (window.confirm("删除这条 nap 记录吗？此操作无法撤销。"))
                            onDelete(record.id);
                        }}
                      >
                        <Trash2 size={16} />
                      </IconButton>
                    </div>
                  </article>
                  {editing?.id === record.id && (
                    <section className="record-editor animate-fade-in" aria-label="编辑记录">
                      <label className="field">
                        <span>休息结果</span>
                        <select
                          value={editing.outcome}
                          onChange={(event) =>
                            setEditing({ ...editing, outcome: event.target.value as Outcome })
                          }
                        >
                          <option value="slept">睡着了</option>
                          <option value="restedAwake">清醒地休息了</option>
                          <option value="couldNotRest">没休息下来</option>
                          <option value="unknown">未记录感受</option>
                        </select>
                      </label>
                      <div className="field">
                        <span>影响因素</span>
                        <FactorPicker
                          selected={editing.factors ?? []}
                          onChange={(factors) => setEditing({ ...editing, factors })}
                        />
                      </div>
                      <label className="field">
                        <span>备注</span>
                        <textarea
                          rows={3}
                          maxLength={500}
                          value={editing.note ?? ""}
                          onChange={(event) => setEditing({ ...editing, note: event.target.value })}
                        />
                      </label>
                      <div className="editor-actions">
                        <button
                          className="text-button"
                          type="button"
                          onClick={() => setEditing(null)}
                        >
                          取消
                        </button>
                        <button
                          className="primary-button"
                          type="button"
                          onClick={() => {
                            const note = editing.note?.trim();
                            const updated = { ...editing };
                            if (note) updated.note = note;
                            else delete updated.note;
                            onUpdate(updated);
                            setEditing(null);
                          }}
                        >
                          <Save size={16} /> 保存修改
                        </button>
                      </div>
                    </section>
                  )}
                </div>
              );
            })}
          </section>
          <section className="patterns">
            <span className="step-number">小结</span>
            {known.length < 5 ? (
              <p>再记录 {5 - known.length} 次感受后，这里会显示简单的观察，不会评分。</p>
            ) : (
              <p>
                在 {known.length} 次有感受记录的小睡里，你有{" "}
                {Math.round((slept / known.length) * 100)}% 睡着了。
                {topFactor && topFactor[1] >= 2
                  ? ` 最近最常记录的影响因素是“${topFactor[0]}”（${topFactor[1]} 次）。`
                  : ""}
                这只是描述，不代表因果或健康建议。
              </p>
            )}
          </section>
        </>
      )}
      <nav className="bottom-nav" aria-label="主导航">
        <button type="button" onClick={onHome}>
          <Home size={20} />
          小睡
        </button>
        <button className="nav-active" type="button">
          <History size={20} />
          记录
        </button>
      </nav>
    </main>
  );
}

declare global {
  interface Window {
    webkitAudioContext?: typeof AudioContext;
  }
}
