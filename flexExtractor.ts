// server/services/flexExtractor.ts

import * as cheerio from 'cheerio';

export interface PlaybackSource {
  id: string;
  url: string;
  protocol: 'hls' | 'mp4' | 'embed';
  provider: string;
  quality: string;
  isActive: boolean;
}

export interface FlexPlaybackResponse {
  slug: string;
  sourceUrl: string;
  status: 'success' | 'no_sources' | 'error';
  streams: PlaybackSource[];
}

const BASE_URL = 'https://www.1flex.org';
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept-Language': 'en-US,en;q=0.9,pt-BR;q=0.8'
};

/**
 * Converte uma URL relativa em absoluta baseada no BASE_URL.
 */
function makeAbsolute(url: string): string {
  if (!url) return '';
  if (url.startsWith('//')) return 'https:' + url;
  if (url.startsWith('/')) return new URL(url, BASE_URL).href;
  return url;
}

/**
 * Extrai URLs de streams (m3u8/mp4) de uma string de HTML.
 * Usa regex avançado para capturar URLs em strings JS, atributos e texto puro.
 */
function extractManifestUrls(html: string): string[] {
  const urls = new Set<string>();
  // Regex: Captura URLs http/https que terminam em .m3u8 ou .mp4
  const pattern = /["']?(https?:\/\/[^\s"'<>]+?\.(?:m3u8|mp4))["']?/g;
  let match;
  while ((match = pattern.exec(html)) !== null) {
    urls.add(match[1]);
  }
  return Array.from(urls);
}

/**
 * Descobre containers de player no DOM usando heurísticas.
 * O 1flex usa estruturas de tabs e iframes dinâmicos.
 */
function discoverPlayerContainers($: cheerio.CheerioAPI): cheerio.Cheerio<any>[] {
  const containers: cheerio.Cheerio<any>[] = [];
  const selector = /player|server|video|tab|episode|channel/i;

  // 1. Iframes são o alvo primário
  $('iframe').each((_, el) => {
    containers.push($(el));
  });

  // 2. Elementos de lista (comuns em tabs de servidor)
  $('li').each((_, el) => {
    const $el = $(el);
    const classes = $el.attr('class') || '';
    const text = $el.text().substring(0, 50);
    if (selector.test(classes) || selector.test(text)) {
      containers.push($el);
    }
  });

  // 3. Divs com classes de player
  $('div').each((_, el) => {
    const $el = $(el);
    const classes = $el.attr('class') || '';
    if (selector.test(classes)) {
      containers.push($el);
    }
  });

  return containers;
}

/**
 * Extrai os streams de playback de uma página do 1flex.
 * @param slug O slug do título (ex: the-witcher-s01e01)
 */
export async function getFlexPlaybackSources(slug: string): Promise<FlexPlaybackResponse> {
  const targetUrl = `${BASE_URL}/${slug}`;
  const response: FlexPlaybackResponse = {
    slug,
    sourceUrl: targetUrl,
    status: 'no_sources',
    streams: []
  };

  try {
    const res = await fetch(targetUrl, { headers: HEADERS });
    if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
    const html = await res.text();
    const $ = cheerio.load(html);

    const seenUrls = new Set<string>();
    const sources: PlaybackSource[] = [];

    // Estratégia 1: Extração Direta de Manifests (Regex Global)
    const globalUrls = extractManifestUrls(html);
    globalUrls.forEach((url, index) => {
      if (!seenUrls.has(url)) {
        seenUrls.add(url);
        sources.push({
          id: `global_${index}`,
          url: makeAbsolute(url),
          protocol: url.endsWith('.m3u8') ? 'hls' : 'mp4',
          provider: 'FlexGlobal',
          quality: 'auto',
          isActive: true
        });
      }
    });

    // Estratégia 2: Extração por Containers (Ifres e Tabs)
    const containers = discoverPlayerContainers($);
    containers.forEach((container, index) => {
      // Verifica se o container tem um iframe
      const iframe = container.find('iframe');
      if (iframe.length > 0) {
        const src = iframe.attr('src');
        if (src && !seenUrls.has(src)) {
          seenUrls.add(src);
          sources.push({
            id: `iframe_${index}`,
            url: makeAbsolute(src),
            protocol: 'embed',
            provider: 'FlexIframe',
            quality: 'auto',
            isActive: true
          });
        }
      }
      // Verifica se o container tem links diretos
      container.find('a[href]').each((_, a) => {
        const href = $(a).attr('href');
        if (href && (href.includes('.m3u8') || href.includes('.mp4')) && !seenUrls.has(href)) {
          seenUrls.add(href);
          sources.push({
            id: `link_${index}`,
            url: makeAbsolute(href),
            protocol: href.endsWith('.m3u8') ? 'hls' : 'mp4',
            provider: 'FlexLink',
            quality: 'auto',
            isActive: true
          });
        }
      });
    });

    // Ordena: HLS primeiro, depois MP4, depois Embeds
    sources.sort((a, b) => {
      const priority = (p: string) => p === 'hls' ? 0 : (p === 'mp4' ? 1 : 2);
      return priority(a.protocol) - priority(b.protocol);
    });

    if (sources.length > 0) {
      response.status = 'success';
      response.streams = sources;
    }

    return response;
  } catch (error) {
    console.error(`Erro ao extrair streams para ${slug}:`, error);
    response.status = 'error';
    return response;
  }
}