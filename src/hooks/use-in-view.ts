import { useEffect, useState } from "react";

export function useInView({ rootMargin = "200px" }: { rootMargin?: string } = {}) {
  const [node, setNode] = useState<Element | null>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    if (!node) return;

    const observer = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting), { rootMargin });
    observer.observe(node);
    return () => observer.disconnect();
  }, [node, rootMargin]);

  return { ref: setNode, inView };
}
