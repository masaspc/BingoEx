import "./Celebration.css";

// Deterministic pieces keep celebrations consistent without timers or JS animation loops.
export default function Celebration({ className = "" }) {
  return (
    <div className={`celebration-confetti ${className}`} aria-hidden="true">
      {Array.from({ length: 42 }, (_, i) => (
        <i
          key={i}
          style={{
            "--confetti-x": `${(i * 37 + 7) % 100}%`,
            "--confetti-delay": `${(i % 7) * 0.17}s`,
            "--confetti-duration": `${3.2 + (i % 5) * 0.35}s`,
            "--confetti-turn": `${180 + (i % 6) * 110}deg`,
            "--confetti-drift": `${((i * 19) % 100) - 50}px`,
          }}
        />
      ))}
    </div>
  );
}
