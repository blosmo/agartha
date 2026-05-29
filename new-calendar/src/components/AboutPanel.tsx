interface AboutPanelProps {
  open: boolean;
  onClose: () => void;
}

const OFFICIAL_SITE = "https://thenewcalendar.com/";

export function AboutPanel({ open, onClose }: AboutPanelProps) {
  if (!open) return null;

  return (
    <div className="about-dialog-root" role="presentation" onClick={onClose}>
      <dialog
        className="about-dialog"
        open
        aria-labelledby="about-dialog-title"
        aria-describedby="about-dialog-description"
        onClick={(event) => event.stopPropagation()}
        onCancel={(event) => {
          event.preventDefault();
          onClose();
        }}
      >
        <header className="about-dialog-header">
          <p className="eyeline">Attribution</p>
          <h2 id="about-dialog-title">About The New Calendar</h2>
          <button type="button" className="about-dialog-close" onClick={onClose}>
            Close
          </button>
        </header>

        <div id="about-dialog-description" className="about-dialog-body">
          <section className="about-section">
            <h3>Tom Sherman</h3>
            <p>
              <a href={OFFICIAL_SITE} target="_blank" rel="noopener noreferrer">
                The New Calendar
              </a>{" "}
              is Tom Sherman&apos;s timekeeping system — a physical calendar and seasonal framework
              presented at{" "}
              <a href={OFFICIAL_SITE} target="_blank" rel="noopener noreferrer">
                thenewcalendar.com
              </a>
              . This dashboard is an unofficial interactive visualization; it is not affiliated with
              or endorsed by the official product.
            </p>
          </section>

          <section className="about-section">
            <h3>What it is</h3>
            <p>
              On the official site, The New Calendar is described as dividing the year into natural,
              organic units — including a fifth season — so days and seasonal markers stay aligned
              year over year instead of drifting like the Gregorian calendar. The product also
              highlights monthly sunlight and temperature charts for multiple latitudes across the
              United States.
            </p>
          </section>

          <section className="about-section">
            <h3>Structure in this app</h3>
            <p>
              This timepiece models the Sherman structure used throughout the codebase: a 365-day
              year anchored at the winter solstice, five 73-day seasons (Winter, Spring, Summer,
              Autumn, Fall), ten 36-day months (two per season), a midpoint reflection day in each
              season, and four 9-day planetary weeks per month (Mercury through Pluto).
            </p>
            <ul className="about-structure-list">
              <li>5 seasons × 73 days = 365 days</li>
              <li>10 months × 36 days, plus 5 reflection days</li>
              <li>4 planetary weeks × 9 days per month</li>
              <li>Gregorian leap day mapped outside normal months/seasons</li>
            </ul>
          </section>

          <section className="about-section">
            <h3>Research &amp; sources</h3>
            <ul className="about-sources-list">
              <li>
                <a href={OFFICIAL_SITE} target="_blank" rel="noopener noreferrer">
                  The New Calendar — thenewcalendar.com
                </a>{" "}
                (official site; product description and positioning)
              </li>
              <li>
                Technical.ly — reported five seasons, ten months, and nine-day weeks named after
                planets, with reusable fixed date positions
              </li>
              <li>
                Cape Gazette — reported 36-day months, four 9-day weeks per month, five 73-day
                seasons, midpoint days between months, winter-solstice anchoring, and leap day
                outside normal months/seasons
              </li>
              <li>
                Emerald24 / <em>Spirals of Creation</em> — Krystal Spiral overlay math in this app
                (interpretive mechanics layer, not part of the official calendar product)
              </li>
            </ul>
          </section>
        </div>
      </dialog>
    </div>
  );
}
