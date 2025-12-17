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

export default function Page() {
  const [items, setItems] = useState<LogItem[]>([]);
  const [title, setTitle] = useState("");
  const [artist, setArtist] = useState("");
  const [note, setNote] = useState("");
  const [tagsRaw, setTagsRaw] = useState("");
  const [rating, setRating] = useState(3);

  const [q, setQ] = useState("");
  const [sort, setSort] = useState<"new" | "old">("new");

  // load
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) setItems(JSON.parse(saved));
    } catch {
      // 何もしない（壊れてても起動はさせる）
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

    list.sort((a, b) => (sort === "new" ? b.createdAt - a.createdAt : a.createdAt - b.createdAt));

    if (!needle) return list;

    return list.filter((it) => {
      const blob = [
        it.title,
        it.artist,
        it.note,
        it.tags.join(" "),
      ]
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

  return (
    <div className="min-h-screen bg-[#070A12] text-[#E8ECFF]">
      <div className="mx-auto max-w-3xl px-4 py-10">
        <header className="mb-8">
          <h1 className="text-2xl font-semibold tracking-tight">
            Music Log
          </h1>
          <p className="mt-2 text-sm text-[#AAB4E6]">
            一曲ずつ、夜の棚に並べていく。
          </p>
        </header>

        {/* Add */}
        <section className="rounded-2xl border border-white/10 bg-white/5 p-4 shadow-sm">
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
                placeholder="例：L'Arc〜en〜Ciel"
                className="w-full rounded-xl border border-white/10 bg-[#0B1020] px-3 py-2 text-sm outline-none focus:border-white/30"
              />
            </label>

            <label className="block sm:col-span-2">
              <div className="mb-1 text-xs text-[#AAB4E6]">ひとこと（任意）</div>
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
              <div className="mt-1 text-[11px] text-[#7E88B8]">「,」や「、」で区切る</div>
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
                <div className="w-8 text-right text-sm tabular-nums">{rating}</div>
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
                // ちょい気が利く：入力中でもEnterで追加できるようにしたい場合は後で
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
            onChange={(e) => setSort(e.target.value as any)}
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
