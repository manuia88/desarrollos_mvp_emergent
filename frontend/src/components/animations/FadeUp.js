// FadeUp — wraps children with blur+fade+translateY animation on viewport entry
import React from 'react';
import useInView from '../../hooks/useInView';

export default function FadeUp({ children, delay = 0, className = '', style = {}, as: Tag = 'div' }) {
  const [ref, inView] = useInView({ once: true, amount: 0.3 });

  return (
    <Tag
      ref={ref}
      className={className}
      style={{
        transition: `all 0.65s cubic-bezier(0.22,1,0.36,1)`,
        transitionDelay: `${delay}s`,
        opacity: inView ? 1 : 0,
        transform: inView ? 'translateY(0)' : 'translateY(20px)',
        filter: inView ? 'blur(0)' : 'blur(6px)',
        ...style,
      }}
    >
      {children}
    </Tag>
  );
}
