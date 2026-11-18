import {useEffect, useRef, useState} from "react";

export function useAnimatedPanel(initial: string) {
  const [panel, setPanel] = useState(initial);
  const [closing, setClosing] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  function show(value: React.SetStateAction<string>) {
    const next = typeof value === "function" ? value(panel) : value;
    clearTimeout(timer.current);
    if (next) {
      setClosing(false);
      setPanel(next);
      return;
    }
    setClosing(true);
    timer.current = setTimeout(() => {
      setPanel("");
      setClosing(false);
    }, matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 190);
  }
  return [panel, show, closing] as const;
}
