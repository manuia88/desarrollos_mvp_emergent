// BlurText — splits text into words, animates each with blur+fade+translateY
// gradientWords: array of words to render in gradient color
import React from 'react';
import useInView from '../../hooks/useInView';
import useReducedMotion from '../../hooks/useReducedMotion';

export default function BlurText({ children, as: Tag = 'h2', gradientWords = [], className = '', style = {} }) {
  const [ref, inView] = useInView({ once: true, amount: 0.3 });
  const reducedMotion = useReducedMotion();
  const words = String(children).split(' ');

  return (
    <Tag ref={ref} className={className} style={{ ...style, display: 'flex', flexWrap: 'wrap', gap: '0.26em 0' }}>
      {words.map((word, i) => {
        const isGrad = gradientWords.includes(word.replace(/[.,!?]$/, ''));
        return (
          <span
            key={i}
            style={{
              display: 'inline-block',
              whiteSpace: 'pre',
              transition: reducedMotion
                ? 'opacity 0.01ms, transform 0.01ms, filter 0.01ms'
                : 'opacity 0.7s cubic-bezier(0.22, 1, 0.36, 1), transform 0.7s cubic-bezier(0.22, 1, 0.36, 1), filter 0.7s cubic-bezier(0.22, 1, 0.36, 1)',
              transitionDelay: reducedMotion ? '0ms' : `${i * 0.07}s`,
              filter: (reducedMotion || inView) ? 'blur(0)' : 'blur(10px)',
              opacity: (reducedMotion || inView) ? 1 : 0,
              transform: (reducedMotion || inView) ? 'translateY(0)' : 'translateY(24px)',
              ...(isGrad ? {
                background: 'var(--grad)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
              } : {}),
              marginRight: i < words.length - 1 ? '0.28em' : 0,
            }}
          >
            {word}
          </span>
        );
      })}
    </Tag>
  );
}
