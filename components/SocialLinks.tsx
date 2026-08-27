"use client";

/**
 * Adapted from a Uiverse.io "isometric" hover-card social icon set —
 * recolored from orange to the app's Nigerian-green brand color, and
 * trimmed from three platforms (Facebook/Twitter/Instagram) down to
 * the two NGOAT actually uses: X and Telegram. The icon glyphs below
 * are drawn as simple geometric shapes rather than copied brand SVG
 * path data, to keep them reliably correct.
 */
export default function SocialLinks() {
  return (
    <div className="social-card">
      <ul>
        <li className="iso-pro">
          <span className="pulse-ring pulse-ring-1" />
          <span className="pulse-ring pulse-ring-2" />
          <span className="pulse-ring pulse-ring-3" />
          <a href="https://x.com/Ngoatcoin" target="_blank" rel="noopener noreferrer">
            <span className="svg-wrap">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <path
                  d="M4 4L20 20M20 4L4 20"
                  stroke="currentColor"
                  strokeWidth="2.4"
                  strokeLinecap="round"
                />
              </svg>
            </span>
          </a>
          <div className="tooltip">X</div>
        </li>

        <li className="iso-pro">
          <span className="pulse-ring pulse-ring-1" />
          <span className="pulse-ring pulse-ring-2" />
          <span className="pulse-ring pulse-ring-3" />
          <a href="https://t.me/Ngoatofficial" target="_blank" rel="noopener noreferrer">
            <span className="svg-wrap">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <path
                  d="M2 12L22 3L14 21L11 13L2 12Z"
                  fill="currentColor"
                  stroke="currentColor"
                  strokeWidth="1"
                  strokeLinejoin="round"
                />
              </svg>
            </span>
          </a>
          <div className="tooltip">Telegram</div>
        </li>
      </ul>
    </div>
  );
}