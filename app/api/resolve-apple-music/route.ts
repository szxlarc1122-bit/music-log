import { NextResponse } from "next/server";

export const runtime = "nodejs"; // 念のため（HTMLパースにNode側が安心）

function extractTrackId(urlStr: string): string | null {
  try {
    const u = new URL(urlStr);
    // 共有URLに ?i=123... が付くことが多い（曲単位）
    const i = u.searchParams.get("i");
    if (i && /^\d+$/.test(i)) return i;
    return null;
  } catch {
    return null;
  }
}

function pickMeta(html: string, key: string): string | null {
  // property="og:title" / name="twitter:title" 両対応
  const re = new RegExp(
    `<meta[^>]+(?:property|name)=["']${key}["'][^>]+content=["']([^"']+)["'][^>]*>`,
    "i"
  );
  const m = html.match(re);
  return m?.[1]?.trim() ?? null;
}

function cleanTitle(s: string) {
  return decodeHtmlEntities(s)
    .replace(/&#39;/g, "'")        // ← これを追加
    .replace(/&apos;/g, "'")       // ← 念のため
    .replace(/&quot;/g, '"')
    .trim()
    .replace(/をApple Musicで.*$/i, "")
    .replace(/- Apple Music.*$/i, "")
    .replace(/^[「『“"”]+/, "")
    .replace(/[」』”"]+$/, "")
    .replace(/\s+/g, " ");
}

}



function decodeHtmlEntities(s: string) {
  return s
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">");
}

function splitJapanesePattern(s: string): { title: string; artist: string } | null {
  const decoded = decodeHtmlEntities(s).trim();

  // よくある末尾を落とす
  const cleaned = decoded
    .replace(/をApple Musicで.*$/i, "")
    .replace(/- Apple Music.*$/i, "")
    .trim();

  // 例：ODD Foot Worksの“時をBABE…” みたいな形
  // アーティストの「曲名」
  const m1 = cleaned.match(/^(.+?)の[「『“"”](.+?)[」』”"]$/);
  if (m1) return { artist: cleanTitle(m1[1]), title: cleanTitle(m1[2]) };


  // 引用符が無い場合：アーティストの曲名
  const m2 = cleaned.match(/^(.+?)の(.+?)$/);
  if (m2) return { artist: cleanTitle(m2[1]), title: cleanTitle(m2[2]) };


  return null;
}


function splitTitleArtist(ogTitle: string): { title: string; artist: string } {
  // Apple Musicのog:titleは地域やページで区切りが揺れるので、よくある区切りで分割を試す
  const decoded = decodeHtmlEntities(ogTitle);

  const separators = [" - ", " — ", " – ", " —", " –", " -"];
  for (const sep of separators) {
    const idx = decoded.indexOf(sep);
    if (idx > 0) {
      const left = decoded.slice(0, idx).trim();
      const right = decoded.slice(idx + sep.length).trim();
      if (left && right) return { title: left, artist: right };
    }
  }
  // 分けられないときはタイトルに全部入れて返す
  return { title: decoded.trim(), artist: "" };
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const url = searchParams.get("url")?.trim();

  if (!url) {
    return NextResponse.json({ error: "missing url" }, { status: 400 });
  }

  // Apple Music系URLだけに軽く制限（安全寄り）
  if (!/^https?:\/\/(music|embed)\.apple\.com\//i.test(url)) {
    return NextResponse.json({ error: "unsupported url" }, { status: 400 });
  }

  const trackId = extractTrackId(url);

  const r = await fetch(url, {
    redirect: "follow",
    headers: {
      // たまにUAで出し分けるので、軽く指定
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome Safari",
    },
  });

  if (!r.ok) {
    return NextResponse.json({ error: "fetch failed" }, { status: 502 });
  }

  const html = await r.text();

  const ogTitle = pickMeta(html, "og:title");
  const ogDesc = pickMeta(html, "og:description") ?? pickMeta(html, "description") ?? pickMeta(html, "twitter:description");


  // まずog:titleから推測
  let title = "";
  let artist = "";

if (ogTitle) {
  const jp = splitJapanesePattern(ogTitle);
  if (jp) {
    title = jp.title;
    artist = jp.artist;
  } else {
    const s = splitTitleArtist(ogTitle);
    title = s.title;
    artist = s.artist;
  }
}


  // artistが空ならdescriptionから補助（完全一致は狙わない）
  if (!artist && ogDesc) {
    const d = decodeHtmlEntities(ogDesc);
    // “Song · Artist” みたいなパターンが来る場合があるので雑に拾う
    const parts = d.split("·").map((x) => x.trim()).filter(Boolean);
    if (parts.length >= 2) {
      // 末尾側をアーティスト候補に
      artist = parts[parts.length - 1];
    }
  }

  if (!title) title = "（取得できませんでした）";

    title = cleanTitle(title);
    artist = cleanTitle(artist);

  return NextResponse.json({
    title,
    artist,
    trackId,      // これが取れれば「二度入れない」の鍵にできる
    sourceUrl: url,
  });
}
