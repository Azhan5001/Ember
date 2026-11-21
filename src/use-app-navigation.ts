import { useEffect, useRef } from "react";

type View = {
  page: string;
  detail: any;
  session: any;
  modal: string;
};
const signature = (view: View) =>
  JSON.stringify([view.page, view.detail?.id, view.session ? "player" : null, view.modal]);

export function useAppNavigation(view: View, restore: (view: View) => void, scope: string) {
  const current = useRef(view);
  const restoreRef = useRef(restore);
  const entries = useRef(new Map<string, View>());
  const last = useRef("");
  const group = useRef(crypto.randomUUID());
  const depth = useRef(0);
  const initialized = useRef(false);
  current.current = view;
  restoreRef.current = restore;

  useEffect(() => {
    if (window.ember && window.ember.platform !== 'android') return;
    const initial = initialized.current
      ? {page: "Home", detail: null, session: null, modal: ""}
      : current.current;
    if (initialized.current) restoreRef.current(initial);
    initialized.current = true;
    group.current = crypto.randomUUID();
    entries.current.clear();
    depth.current = 0;
    const key = crypto.randomUUID();
    entries.current.set(key, initial);
    last.current = signature(initial);
    history.replaceState({ember: group.current, key, depth: 0}, "");
    const pop = (event: PopStateEvent) => {
      const saved = event.state;
      if (saved?.ember !== group.current) return;
      let previous = entries.current.get(saved.key);
      if(current.current.session||previous?.session){previous={page:"Home",detail:null,session:null,modal:""};for(const [id,entry] of entries.current)if(entry.session)entries.current.set(id,previous);entries.current.set(saved.key,previous);history.replaceState(saved,"");}
      if (!previous) return;
      depth.current = saved.depth;
      last.current = signature(previous);
      restoreRef.current(previous);
    };
    window.addEventListener("popstate", pop);
    return () => window.removeEventListener("popstate", pop);
  }, [scope]);

  useEffect(() => {
    if (window.ember && window.ember.platform !== 'android') return;
    const next = signature(view);
    if (next !== last.current) {
      const key = crypto.randomUUID();
      depth.current += 1;
      entries.current.set(key, view);
      while(entries.current.size>50)entries.current.delete(entries.current.keys().next().value!);
      history.pushState({ember: group.current, key, depth: depth.current}, "");
      last.current = next;
    } else {
      // Source loading and metadata refresh update an existing view.
      const key = history.state?.key;
      if (key) entries.current.set(key, view);
    }
  }, [view.page, view.detail, view.session, view.modal]);

  return (fallback: () => void) => {
    if ((!window.ember || window.ember.platform === 'android') && history.state?.ember === group.current && depth.current > 0) {
      history.back();
    } else {
      fallback();
    }
  };
}
