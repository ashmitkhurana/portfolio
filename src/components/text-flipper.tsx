import React from "react"
import { motion } from "framer-motion"

const DURATION = 0.25
const STAGGER = 0.025

interface FlipLinkProps {
  children: string
  href: string
  icon?: React.ReactNode
  iconBg?: string
  iconHoverBg?: string
  iconColor?: string
  iconHoverColor?: string
  iconPosition?: 'left' | 'right'
}

const FlipLink: React.FC<FlipLinkProps> = ({
  children,
  href,
  icon,
  iconBg = '#e5e7eb',
  iconHoverBg = '#111',
  iconColor = '#111',
  iconHoverColor = '#fff',
  iconPosition = 'left',
}) => {
  const isMailto = href.startsWith('mailto:');
  const linkProps = isMailto
    ? { href }
    : { href, target: '_blank', rel: 'noopener noreferrer' };
  return (
    <div
      className={`flip-link-container ${iconPosition === 'right' ? 'flip-link-row-reverse' : ''}`}
      style={{
        '--icon-bg': iconBg,
        '--icon-hover-bg': iconHoverBg,
        '--icon-color': iconColor,
        '--icon-hover-color': iconHoverColor,
      } as React.CSSProperties}
    >
      {icon && (
        <span className="flip-link-icon">
          {icon}
        </span>
      )}
      <motion.a
        initial="initial"
        whileHover="hovered"
        {...linkProps}
        className="relative block overflow-hidden whitespace-nowrap leading-none text-4xl font-bold uppercase text-black dark:text-white/90 sm:text-7xl md:text-8xl"
        style={{
          lineHeight: 1,
          height: '1em',
          display: 'inline-block',
        }}
      >
        <div>
          {children.split("").map((l, i) => (
            <motion.span
              variants={{
                initial: {
                  y: 0,
                },
                hovered: {
                  y: "-100%",
                },
              }}
              transition={{
                duration: DURATION,
                ease: "easeInOut",
                delay: STAGGER * i,
              }}
              className="inline-block"
              key={i}
            >
              {l}
            </motion.span>
          ))}
        </div>
        <div className="absolute inset-0">
          {children.split("").map((l, i) => (
            <motion.span
              variants={{
                initial: {
                  y: "100%",
                },
                hovered: {
                  y: 0,
                },
              }}
              transition={{
                duration: DURATION,
                ease: "easeInOut",
                delay: STAGGER * i,
              }}
              className="inline-block"
              key={i}
            >
              {l}
            </motion.span>
          ))}
        </div>
      </motion.a>
    </div>
  )
}

export default FlipLink; 