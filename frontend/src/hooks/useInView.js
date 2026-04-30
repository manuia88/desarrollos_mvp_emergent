// useInView — IntersectionObserver hook
// once: true = animates only the first time element enters viewport (per spec)
import { useState, useEffect, useRef } from 'react';

export default function useInView(options = {}) {
  const { once = true, amount = 0.3 } = options;
  const ref = useRef(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true);
          if (once) observer.unobserve(el);
        } else if (!once) {
          setInView(false);
        }
      },
      { threshold: amount }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [once, amount]);

  return [ref, inView];
}
