import React from "react";

function cardSizeClass(playerCount) {
  if (playerCount >= 7) return "w-16";
  if (playerCount === 6) return "w-18";
  if (playerCount === 5) return "w-20";
  return "w-20";
}

function StaggeredBacks({ count, sizeClass }) {
  const n = Math.min(count ?? 0, 6);
  if (n <= 0) return <div className="text-[10px] text-amber-200/60 italic">no cards</div>;
  return (
    <div className="relative h-14">
      {Array.from({ length: n }).map((_, i) => (
        <img
          key={i}
          src="/assets/ui/building_back.jpg"
          alt="Hand"
          className={`absolute top-0 ${sizeClass} aspect-[2/3] object-cover rounded-lg border border-black/40 shadow-xl opacity-90`}
          style={{ left: `${i * 10}px`, transform: `rotate(${(i - (n - 1) / 2) * 4}deg)` }}
        />
      ))}
      {count > n && (
        <div className="absolute -right-2 -bottom-1 text-[10px] font-mono font-black text-amber-100 bg-black/70 px-2 py-0.5 rounded-full border border-amber-900/30">
          +{count - n}
        </div>
      )}
    </div>
  );
}

function SeatCard({ player, sizeClass }) {
  return (
    <div className="bg-black/35 backdrop-blur-sm rounded-2xl border border-black/30 shadow-2xl p-3 w-[240px]">
      <div className="flex items-center justify-between gap-3 mb-2">
        <div className="font-serif font-black text-amber-200 uppercase tracking-widest text-xs truncate">{player.name}</div>
        <div className="text-[11px] font-mono font-black text-amber-200 bg-black/50 px-2 py-0.5 rounded-full border border-amber-900/30">
          {player.gold ?? 0}g
        </div>
      </div>
      <div>
        <div className="text-[10px] uppercase tracking-widest text-amber-200/60 mb-1">Hand</div>
        <StaggeredBacks count={(player.hand || []).length} sizeClass={sizeClass} />
      </div>
    </div>
  );
}

export default function DraftSeats({ state }) {
  const players = state.players || [];
  const viewerId = state.localPlayerId ?? players.find(p => !p.isBot)?.id ?? players[0]?.id;
  const me = players.find((p) => p.id === viewerId) || players[0];
  if (!me) return null;

  const others = players.filter((p) => p.id !== me.id);
  const sizeClass = cardSizeClass(players.length);

  // Fill right side top->bottom then left side top->bottom (matches your green-box idea)
  const right = others.slice(0, 3);
  const left = others.slice(3, 6);

  const slotsRight = ["top-28 right-8", "top-1/2 right-8 -translate-y-1/2", "bottom-28 right-8"];
  const slotsLeft = ["top-28 left-8", "top-1/2 left-8 -translate-y-1/2", "bottom-28 left-8"];

  return (
    <>
      {/* Deck badge */}
      <div className="fixed top-3 left-1/2 -translate-x-1/2 z-40 text-[11px] font-mono font-black text-amber-200 bg-black/60 px-3 py-1 rounded-full border border-amber-900/30">
        Deck: {state.deck?.length ?? 0}
      </div>

      {right.map((p, i) => (
        <div key={p.id} className={`fixed z-30 hidden lg:block ${slotsRight[i]}`}>
          <SeatCard player={p} sizeClass={sizeClass} />
        </div>
      ))}

      {left.map((p, i) => (
        <div key={p.id} className={`fixed z-30 hidden lg:block ${slotsLeft[i]}`}>
          <SeatCard player={p} sizeClass={sizeClass} />
        </div>
      ))}
    </>
  );
}
