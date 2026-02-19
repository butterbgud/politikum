import React from "react";

function seatTransforms(seatCount) {
  // We need to spread opponents across the top arc.
  // 1 opponent: Top Center
  // 2 opponents: Top Left, Top Right
  // 3 opponents: Top Left, Top Center, Top Right
  // 4+ opponents: spread further
  const base = {
    1: ["top-10 left-1/2 -translate-x-1/2"],
    2: ["top-20 left-[15%] -translate-x-1/2", "top-20 left-[85%] -translate-x-1/2"],
    3: ["top-24 left-[15%] -translate-x-1/2", "top-10 left-1/2 -translate-x-1/2", "top-24 left-[85%] -translate-x-1/2"],
    4: ["top-32 left-[10%] -translate-x-1/2", "top-15 left-[35%] -translate-x-1/2", "top-15 left-[65%] -translate-x-1/2", "top-32 left-[90%] -translate-x-1/2"],
    5: ["top-40 left-[10%]", "top-20 left-[25%]", "top-10 left-1/2 -translate-x-1/2", "top-20 left-[75%]", "top-40 left-[90%]"],
    6: ["top-40 left-[5%]", "top-25 left-[20%]", "top-15 left-[40%]", "top-15 left-[60%]", "top-25 left-[80%]", "top-40 left-[95%]"],
  };
  return base[seatCount] || base[3];
}

function StaggeredBacks({ count }) {
  const n = Math.min(count ?? 0, 5);
  if (n <= 0) return null;
  return (
    <div className="relative h-24 w-28">
      {Array.from({ length: n }).map((_, i) => (
        <img
          key={i}
          src="/assets/ui/building_back.jpg"
          alt=""
          className="absolute top-0 w-24 aspect-[2/3] object-cover rounded border border-black/40 shadow-2xl"
          style={{ left: `${i * 12}px`, zIndex: i }}
        />
      ))}
    </div>
  );
}

function CityFan({ cards }) {
  const all = cards || [];
  const n = Math.min(all.length, 6);
  if (!n) return <div className="text-[10px] text-amber-900/40 italic">empty city</div>;
  const stepX = 18;

  return (
    <div className="relative h-12">
      {all.slice(-n).map((c, i) => (
        <img
          key={c.id}
          src={c.img}
          alt={c.name}
          className="absolute w-10 aspect-[2/3] object-cover rounded border border-black/40 shadow-xl transition-transform hover:scale-[2.5] hover:z-50"
          style={{ left: `${i * stepX}px`, zIndex: i }}
          title={c.name}
        />
      ))}
      <div style={{ width: `${(n - 1) * stepX + 40}px` }} />
    </div>
  );
}

function PlayerZone({ player, isActive }) {
  const handCount = (player.hand || []).length;
  const points = (player.city || []).reduce((acc, c) => acc + (c.cost || 0), 0);
  const roleImg = (player.role && player.roleRevealed) ? (player.role.img) : "/assets/ui/character_back.jpg";
  const showRoleCard = !!player.role && (player.roleRevealed || isActive);

  return (
    <div className={`min-w-[200px] transition-transform duration-300 ${isActive ? 'scale-110' : ''}`}>
      <div className="text-[10px] font-mono font-black text-amber-200/90">
        {player.name}
        <span className="inline-flex items-center gap-1 bg-black/55 rounded-full px-2 py-0.5 border border-black/40 ml-2">
          <span>{player.gold}g</span>
          <span className="opacity-70 px-1">•</span>
          <span>{points}p</span>
          <span className="opacity-70 px-1">•</span>
          <span>{handCount}c</span>
        </span>
      </div>
      <div className="mt-2 flex gap-3 items-center">
        <div className="relative">
          <StaggeredBacks count={handCount} />
          {/* role card, offset to the side of the hand */}
          {showRoleCard && (
            <img
              src={roleImg}
              alt="Role"
              className={`absolute -right-20 top-2 w-24 aspect-[2/3] object-cover rounded border border-black/40 shadow-2xl ${player.roleRevealed ? '' : 'opacity-90'}`}
              title={player.role?.name}
            />
          )}
        </div>
        <div className="relative">
          <CityFan cards={player.city} />
        </div>
      </div>
    </div>
  );
}

export default function Board({ state, viewerId }) {
  const players = state.players || [];
  if (!players.length) return null;

  // viewerId in multiplayer is a string "0", "1", etc.
  const myIndex = players.findIndex(p => p.id === String(viewerId));
  const activeIdx = myIndex === -1 ? 0 : myIndex;

  const me = players[activeIdx];
  
  // Create an array of everyone EXCEPT the viewer, starting from the next player
  const others = [];
  for (let i = 1; i < players.length; i++) {
    others.push(players[(activeIdx + i) % players.length]);
  }

  const transforms = seatTransforms(others.length);

  return (
    <div className="fixed inset-0 pointer-events-none z-[100]">
      {/* Viewer HUD (near purse) */}
      <div className="absolute bottom-4 left-56 pointer-events-none z-[200]">
        <div className="inline-flex items-center gap-2 bg-black/55 rounded-full px-4 py-2 border border-black/40 shadow-2xl">
          <div className="text-amber-100 font-serif font-black text-2xl drop-shadow-[0_2px_8px_rgba(0,0,0,0.8)]">
            {(me?.gold ?? 0)}g <span className="opacity-70 px-2">•</span> {((me?.city || []).reduce((acc, c) => acc + (c.cost || 0), 0))}p
          </div>
        </div>
      </div>

      {others.map((p, idx) => {
        const isCurrentlyActive = String(p.id) === String(state.currentPlayerId);
        return (
          <div key={p.id} className={`absolute transition-all duration-500 pointer-events-auto ${transforms[idx]}`}>
            <PlayerZone player={p} isActive={isCurrentlyActive} />
          </div>
        );
      })}
    </div>
  );
}
