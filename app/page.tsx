"use client";

import React, { useEffect, useMemo, useState } from "react";

type LogItem = {
  id: string;
  title: string;
  artist: string;
  note: string;
  tags: string[]; // ["夜", "作業用"] など
  rating: number; // 0-5
  createdAt: number; // epoch ms

  // Apple Music link import 用
  sourceUrl?: string;
  appleTrackId?: string; // 共有URLの ?i= の数字（取れたら重複判定の鍵）
};

const STORAGE_KEY = "music_log_v1";

function uid() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function formatDate(ts: number) {
  const d = new Date(ts);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}`;
}

function parseTags(raw: string) {
  return raw
    .split(/[、,]/g)
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, 10);
}

function normalizeKey(title: string, artist: string) {
  // appleTrackIdが取れないケース用の“弱い”重複判定キー
  return `${artist}__${title}`.toLowerCase().replace(/\s+/g, " ").trim();
}

export default function Page() {
  const [items, setItems] = useState<LogItem[]>([]);
  const [title, setTitle] = useState("");
  const [artist, setArtist] = useState("");
  const [note, setNote] = useState("");
  const [tagsRaw, setTagsRaw] = useState("");
  const [rating, setRating] = useState(3);

  // Apple Music link import
  const [appleUrl, setAppleUrl] = useState("");
  const [syncMsg, setSyncMsg] = useState<string>("");

  const [q, setQ] = useState("");
  const [sort, setSort] = useState<"new" | "old">("new");

  // load
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) setItems(JSON.parse(saved));
    } catch {
      // 壊れてても起動はさせる
    }
  }, []);

  // save
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    } catch {
      // 容量などで失敗する可能性はある
    }
  }, [items]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    let list = [...items];

    list.sort((a, b) =>
      sort === "new" ? b.createdAt - a.createdAt : a.createdAt - b.createdAt
    );

    if (!needle) return list;

    return list.filter((it) => {
      const blob = [it.title, it.artist, it.note, it.tags.join(" ")]
        .join(" ")
        .toLowerCase();
      return blob.includes(needle);
    });
  }, [items, q, sort]);

  function addItem() {
    const t = title.trim();
    const a = artist.trim();
    if (!t || !a) return;

    const newItem: LogItem = {
      id: uid(),
      title: t,
      artist: a,
      note: note.trim(),
      tags: parseTags(tagsRaw),
      rating: Math.max(0, Math.min(5, rating)),
      createdAt: Date.now(),
    };

    setItems((prev) => [newItem, ...prev]);

    setTitle("");
    setArtist("");
    setNote("");
    setTagsRaw("");
    setRating(3);
  }

  function removeItem(id: string) {
    setItems((prev) => prev.filter((x) => x.id !== id));
  }

  function clearAll() {
    if (!confirm("全部消す？（この端末のログが消えます）")) return;
    setItems([]);
  }

  async function importFromAppleMusic() {
    setSyncMsg("");
    const url = appleUrl.trim();
    if (!url) return;

    try {
      const res = await fetch(
        `/api/resolve-apple-music?url=${encodeURIComponent(url)}`
      );
      const data = await res.json();

      if (!res.ok) {
        setSyncMsg("取り込みできなかった（URLが違うかも）");
        return;
      }

      const t = String(data.title ?? "").trim();
      const a = String(data.artist ?? "").trim();
      const appleTrackId = (data.trackId as string | null) ?? null;
      const sourceUrl = String(data.sourceUrl ?? url);

      // 重複判定：trackIdが取れたら最優先
      if (appleTrackId) {
        const exists = items.some((x) => x.appleTrackId === appleTrackId);
        if (exists) {
          setSyncMsg("これはもうログにあるみたい。新しい曲だけ育てよう。");
          return;
        }
      } else {
        // trackIdが無い場合は、タイトル+アーティストで弱い重複判定
        const key = normalizeKey(t, a);
        const exists = items.some((x) => normalizeKey(x.title, x.artist) === key);
        if (exists) {
          setSyncMsg("同じ曲っぽいのが既にあるみたい。新しい曲だけ育てよう。");
          return;
        }
      }

      if (t && a) {
        const newItem: LogItem = {
          id: uid(),
          title: t,
          artist: a,
          note: "",
          tags: [],
          rating: 3,
          createdAt: Date.now(),
          sourceUrl,
          appleTrackId: appleTrackId ?? undefined,
        };
        setItems((prev) => [newItem, ...prev]);
        setAppleUrl("");
        setSyncMsg("新しい一曲を追加したよ。");
      } else {
        // 入力欄に流し込んで手で直してもらう
        if (t) setTitle(t);
        if (a) setArtist(a);
        setSyncMsg("情報は取れたけど分解が微妙かも。必要なら少し直してね。");
      }
    } catch {
      setSyncMsg("通信でつまずいたみたい。もう一回だけ試してみて。");
    }
  }

  return (
    <div className="min-h-screen bg-[#070A12] text-[#E8ECFF]">
      <div className="mx-auto max-w-3xl px-4 py-10">
        <header className="mb-8">
          <h1 className="text-2xl font-semibold tracking-tight">Music Log</h1>
          <p className="mt-2 text-sm text-[#AAB4E6]">
            一曲ずつ、棚に並べていく。
          </p>
        </header>

        {/* Add */}
        <section className="rounded-2xl border border-white/10 bg-white/5 p-4 shadow-sm">
          {/* Apple Music link import */}
          <div className="mb-4 rounded-2xl border border-white/10 bg-white/5 p-3">
            <div className="mb-2 text-xs text-[#AAB4E6]">
              Apple Musicリンク取り込み（共有→リンクをコピー→ここに貼る）
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                value={appleUrl}
                onChange={(e) => setAppleUrl(e.target.value)}
                placeholder="https://music.apple.com/..."
                className="w-full flex-1 rounded-xl border border-white/10 bg-[#0B1020] px-3 py-2 text-sm outline-none focus:border-white/30"
              />
              <button
                onClick={importFromAppleMusic}
                className="rounded-xl bg-white/15 px-4 py-2 text-sm hover:bg-white/20 active:bg-white/25"
              >
                取り込む
              </button>
            </div>
            {syncMsg ? (
              <div className="mt-2 text-xs text-[#C9D1FF]">{syncMsg}</div>
            ) : null}
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="block">
              <div className="mb-1 text-xs text-[#AAB4E6]">曲名 *</div>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="例：READY STEADY GO"
                className="w-full rounded-xl border border-white/10 bg-[#0B1020] px-3 py-2 text-sm outline-none focus:border-white/30"
              />
            </label>

            <label className="block">
              <div className="mb-1 text-xs text-[#AAB4E6]">アーティスト *</div>
              <input
                value={artist}
                onChange={(e) => setArtist(e.target.value)}
                placeholder="例：L&apos;Arc〜en〜Ciel"
                className="w-full rounded-xl border border-white/10 bg-[#0B1020] px-3 py-2 text-sm outline-none focus:border-white/30"
              />
            </label>

            <label className="block sm:col-span-2">
              <div className="mb-1 text-xs text-[#AAB4E6]">
                ひとこと（任意）
              </div>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="例：イントロで体温が戻る"
                className="h-20 w-full resize-none rounded-xl border border-white/10 bg-[#0B1020] px-3 py-2 text-sm outline-none focus:border-white/30"
              />
            </label>

            <label className="block">
              <div className="mb-1 text-xs text-[#AAB4E6]">タグ（任意）</div>
              <input
                value={tagsRaw}
                onChange={(e) => setTagsRaw(e.target.value)}
                placeholder="例：夜, 作業用, 深海リバーブ"
                className="w-full rounded-xl border border-white/10 bg-[#0B1020] px-3 py-2 text-sm outline-none focus:border-white/30"
              />
              <div className="mt-1 text-[11px] text-[#7E88B8]">
                「,」や「、」で区切る
              </div>
            </label>

            <label className="block">
              <div className="mb-1 text-xs text-[#AAB4E6]">評価</div>
              <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-[#0B1020] px-3 py-2">
                <input
                  type="range"
                  min={0}
                  max={5}
                  step={1}
                  value={rating}
                  onChange={(e) => setRating(Number(e.target.value))}
                  className="w-full"
                />
                <div className="w-8 text-right text-sm tabular-nums">
                  {rating}
                </div>
              </div>
            </label>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              onClick={addItem}
              className="rounded-xl bg-white/15 px-4 py-2 text-sm hover:bg-white/20 active:bg-white/25"
            >
              追加
            </button>
            <button
              onClick={() => {
                setTitle("");
                setArtist("");
                setNote("");
                setTagsRaw("");
                setRating(3);
              }}
              className="rounded-xl border border-white/10 px-4 py-2 text-sm text-[#C9D1FF] hover:bg-white/5"
            >
              入力クリア
            </button>
            <button
              onClick={clearAll}
              className="ml-auto rounded-xl border border-white/10 px-4 py-2 text-sm text-[#FFCFD6] hover:bg-white/5"
              title="この端末のログを全消し"
            >
              全消し
            </button>
          </div>
        </section>

        {/* Controls */}
        <section className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="検索（曲名/アーティスト/メモ/タグ）"
            className="w-full flex-1 rounded-xl border border-white/10 bg-[#0B1020] px-3 py-2 text-sm outline-none focus:border-white/30"
          />
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as "new" | "old")}
            className="w-full rounded-xl border border-white/10 bg-[#0B1020] px-3 py-2 text-sm outline-none focus:border-white/30 sm:w-40"
          >
            <option value="new">新しい順</option>
            <option value="old">古い順</option>
          </select>
        </section>

        {/* List */}
        <section className="mt-6 space-y-3">
          {filtered.length === 0 ? (
            <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-sm text-[#AAB4E6]">
              まだ何もない。最初の一曲、置いていこう。
            </div>
          ) : (
            filtered.map((it) => (
              <article
                key={it.id}
                className="rounded-2xl border border-white/10 bg-white/5 p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="text-base font-semibold leading-snug">
                      {it.title}
                      <span className="ml-2 text-sm font-normal text-[#AAB4E6]">
                        — {it.artist}
                      </span>
                    </h2>
                    <div className="mt-1 text-xs text-[#7E88B8]">
                      {formatDate(it.createdAt)} ・ ★ {it.rating}
                    </div>
                  </div>

                  <button
                    onClick={() => removeItem(it.id)}
                    className="rounded-xl border border-white/10 px-3 py-1.5 text-xs text-[#FFCFD6] hover:bg-white/5"
                  >
                    削除
                  </button>
                </div>

                {it.note ? (
                  <p className="mt-3 whitespace-pre-wrap text-sm text-[#D7DCFF]">
                    {it.note}
                  </p>
                ) : null}

                {it.tags.length ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {it.tags.map((t) => (
                      <span
                        key={t}
                        className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-[#C9D1FF]"
                      >
                        #{t}
                      </span>
                    ))}
                  </div>
                ) : null}

                {it.sourceUrl ? (
                  <div className="mt-3 text-xs text-[#AAB4E6]">
                    <a
                      href={it.sourceUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="underline decoration-white/20 hover:decoration-white/40"
                    >
                      Apple Musicで開く
                    </a>
                    {it.appleTrackId ? (
                      <span className="ml-2 text-[#7E88B8]">
                        （ID: {it.appleTrackId}）
                      </span>
                    ) : null}
                  </div>
                ) : null}
              </article>
            ))
          )}
        </section>

        <footer className="mt-10 text-xs text-[#7E88B8]">
          ※ データはこの端末のブラウザに保存されます（同期はしません）
        </footer>
      </div>
    </div>
  );
}
