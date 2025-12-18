import { NextResponse } from "next/server";

export const runtime = "nodejs";

function extractTrackId(urlStr: string): string | null {
  try {
    const u = new URL(urlStr);
    // 共有URLに ?i=123... が付くことが多い（曲単位）
    const i = u.searchParams.get("i");
    if (i && /^\d+$/.test(i)) return i;
    // /song/.../<id> みたいな末尾IDも拾う（保険）
    const m = u.pathname.match(/\/(\d+)(?:\?.*)?$/);
    return m?.[1] ?? null;
  } catch {
    return null;
  }
}

function pickMeta(html: string, key: string): string | null {
  try {
    // property="og:title" / name="twitter:title" 両対応
    // content= が " でも ' でもOK、改行も跨いでOK
    const re = new RegExp(
      `<meta[^>]+(?:property|name)=["']${key}["'][^>]*content=(["'])([\\s\\S]*?)\\1`,
      "i"
    );
    const m = html.match(re);
    return m?.[2]?.trim() ?? null;
  } catch {
    return null;
  }
}

function decodeHtmlEntities(s: string): string {
  // 最低限。必要なら増やせる
  return s
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'")
    .replaceAll("&#39;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">");
}

function cleanTitle(s: string): string {
  return decodeHtmlEntities(s)
    .trim()
    // Apple Music の余計な文言を落とす
    .replace(/をApple Musicで.*$/i, "")
    .replace(/- Apple Music.*$/i, "")
    // 先頭末尾の引用符を落とす
    .replace(/^[「『“"”']+/, "")
    .replace(/[」』”"']+$/, "")
    // 空白正規化
    .replace(/\s+/g, " ")
    .trim();
}

function splitJapanesePattern(s: string): { title: string; artist: string } | null {
  const cleaned = cleanTitle(s);

  // 例：ODD Foot Worksの「時をBABE」
  const m1 = cleaned.match(/^(.+?)の[「『“"”](.+?)[」』”"]$/);
  if (m1) return { artist: cleanTitle(m1[1]), title: cleanTitle(m1[2]) };

  // 引用符なしの保険：アーティストの曲名
  const m2 = cleaned.match(/^(.+?)の(.+?)$/);
  if (m2) return { artist: cleanTitle(m2[1]), title: cleanTitle(m2[2]) };

  return null;
}

function splitTitleArtistFallback(s: string): { title: string; artist: string } {
  // よくある形式：Title - Artist / Title — Artist
  const cleaned = cleanTitle(s);
  const parts = cleaned.split(/\s[-—–]\s/);
  if (parts.length >= 2) {
    return { title: cleanTitle(parts[0]), artist: cleanTitle(parts.slice(1).join(" - ")) };
  }
  // 逆に Artist - Title の可能性もあるが、ここでは深追いしない
  return { title: cleaned, artist: "" };
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const url = searchParams.get("url");

    if (!url) {
      return NextResponse.json({ error: "missing_url" }, { status: 400 });
    }

    // Apple Music のページを取得
    const r = await fetch(url, {
      method: "GET",
      headers: {
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome Safari",
        accept: "text/html,application/xhtml+xml",
      },
      // 念のため
      redirect: "follow",
    });

    if (!r.ok) {
      return NextResponse.json(
        { error: "fetch_failed", status: r.status },
        { status: 502 }
      );
    }

    const html = await r.text();

    const ogTitle =
      pickMeta(html, "og:title") ??
      pickMeta(html, "twitter:title") ??
      pickMeta(html, "title");

    const ogDesc =
      pickMeta(html, "og:description") ??
      pickMeta(html, "twitter:description") ??
      pickMeta(html, "description");

    let title = "";
    let artist = "";

    // 1) og:title を優先して日本語パターンを試す
    if (ogTitle) {
      const jp = splitJapanesePattern(ogTitle);
      if (jp) {
        title = jp.title;
        artist = jp.artist;
      } else {
        const fb = splitTitleArtistFallback(ogTitle);
        title = fb.title;
        artist = fb.artist;
      }
    }

    // 2) artist が空なら description から補助（完全一致は狙わない）
    if (!artist && ogDesc) {
      const d = cleanTitle(ogDesc);
      // "Song · Artist" みたいなことがあるので末尾側を候補に
      const parts = d.split("·").map((x) => x.trim()).filter(Boolean);
      if (parts.length >= 2) {
        artist = cleanTitle(parts[parts.length - 1]);
      }
    }

    // trackId は「二度入れない」の鍵
    const trackId = extractTrackId(url);

    if (!title) title = "（取得できませんでした）";

    title = cleanTitle(title);
    artist = cleanTitle(artist);

    return NextResponse.json({
      title,
      artist,
      trackId,
      sourceUrl: url,
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      {
        error: "server_error",
        message: e instanceof Error ? e.message : String(e),
      },
      { status: 500 }
    );
  }
}
