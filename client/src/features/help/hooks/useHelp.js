import { useMemo } from 'react';
import { useAppStore } from '../../../app/store.js';
import { useReference } from '../../../shared/hooks/index.js';
import { ARTICLES, audiencesFor, isFor, liveValues } from '../lib/help.js';

/** Live policy values for {{placeholders}} in articles. */
export function useHelpValues() {
  const { data: ref } = useReference();
  return useMemo(() => liveValues(ref), [ref]);
}

/** The signed-in person's audiences, and the articles meant for them. */
export function useMyArticles() {
  const user = useAppStore((s) => s.user);
  return useMemo(() => {
    const audiences = audiencesFor(user?.role);
    return { audiences, mine: ARTICLES.filter((a) => isFor(a, audiences)) };
  }, [user?.role]);
}
