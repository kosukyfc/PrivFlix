// Exemplo de uso no seu componente React (ex: PlayerSection.tsx)

import { useState, useEffect } from 'react';
import { trpc } from '../lib/trpc';
import Hls from 'hls.js';
import type { PlaybackSource } from '../../../server/services/flexExtractor';

export function FlexPlayer({ slug }: { slug: string }) {
  const [videoElement, setVideoElement] = useState<HTMLVideoElement | null>(null);
  const [currentStream, setCurrentStream] = useState<PlaybackSource | null>(null);
  const [streams, setStreams] = useState<PlaybackSource[]>([]);
  const [error, setError] = useState<string | null>(null);

  const { data: playbackData, isLoading, isError } = trpc.flex.getPlayback.useQuery({ slug });

  useEffect(() => {
    if (playbackData && playbackData.streams.length > 0) {
      setStreams(playbackData.streams);
      // Auto-play do primeiro servidor
      setCurrentStream(playbackData.streams[0]);
    }
  }, [playbackData]);

  useEffect(() => {
    if (!videoElement || !currentStream) return;

    let hls: Hls | null = null;

    if (currentStream.protocol === 'hls') {
      if (Hls.isSupported()) {
        hls = new Hls();
        hls.loadSource(currentStream.url);
        hls.attachMedia(videoElement);
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          videoElement.play();
        });
      } else if (videoElement.canPlayType('application/vnd.apple.mpegurl')) {
        videoElement.src = currentStream.url;
        videoElement.play();
      }
    } else if (currentStream.protocol === 'mp4') {
      videoElement.src = currentStream.url;
      videoElement.play();
    }

    return () => {
      if (hls) hls.destroy();
      videoElement.src = '';
    };
  }, [videoElement, currentStream]);

  const handleStreamChange = (stream: PlaybackSource) => {
    setCurrentStream(stream);
  };

  if (isLoading) return <div>Carregando servidores...</div>;
  if (isError || (playbackData && playbackData.status === 'no_sources')) {
    return <div>Nenhum servidor disponível para este título.</div>;
  }

  return (
    <div className="player-container">
      <video 
        ref={setVideoElement} 
        controls 
        playsInline 
        style={{ width: '100%', maxHeight: '70vh', background: '#000', borderRadius: '8px' }}
      />
      <div className="server-selector">
        <h3>Servidores Disponíveis</h3>
        <ul style={{ listStyle: 'none', padding: 0, display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          {streams.map((s) => (
            <li key={s.id} 
                onClick={() => handleStreamChange(s)}
                style={{ 
                  padding: '8px 12px', 
                  background: currentStream?.id === s.id ? '#6366f1' : '#333', 
                  borderRadius: '6px', 
                  cursor: 'pointer', 
                  fontSize: '14px' 
                }}>
              Servidor {s.id.split('_')[1]} ({s.protocol.toUpperCase()})
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}