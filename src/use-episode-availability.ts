import { useEffect, useState, type RefObject } from 'react';
import { lookupStreams, type Addon } from './api';

export function useEpisodeAvailability(root: RefObject<HTMLElement | null>, addons: Addon[], season: number, videos: any[], visible: boolean) {
  const [missing, setMissing] = useState<Set<string>>(new Set());
  useEffect(() => {
    setMissing(new Set());
    if (!visible || !root.current) return;
    let active = true, workers = 0;
    const queue: string[] = [];
    async function check() {
      workers++;
      try {
        while (active && queue.length) {
          const id = queue.shift()!;
          const result = await lookupStreams(addons, 'series', id);
          if (active && result.complete && !result.sources.length)
            setMissing(old => new Set(old).add(id));
        }
      } finally { workers--; }
    }
    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        observer.unobserve(entry.target);
        queue.push((entry.target as HTMLElement).dataset.episodeId!);
      }
      while (active && workers < 2 && queue.length) void check();
    }, { root: root.current, rootMargin: '80px' });
    root.current.querySelectorAll('[data-episode-id]').forEach(row => observer.observe(row));
    return () => { active = false; observer.disconnect(); };
  }, [root, addons, season, videos, visible]);
  return missing;
}
