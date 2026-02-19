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

function HandBack({ count }) {
  const n = count ?? 0;
  if (n <= 0) return null;
  return (
    <div className="relative h-12 w-10">
      <img
        src="/assets/ui/building_back.jpg"
        alt=""
        className="absolute inset-0 w-10 aspect-[2/3] object-cover rounded border border-black/40 shadow-xl"
      />
      <div className="absolute -top-2 -right-2 bg-black/75 border border-amber-600/40 text-amber-200 font-mono font-black text-[10px] px-1.5 py-0.5 rounded">
        {n}
      </div>
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

  return (
    <div className={`min-w-[200px] transition-transform duration-300 ${isActive ? 'scale-110' : ''}`}>
      <div className="text-[10px] font-mono font-black text-amber-200/90">
        {player.name} · {player.gold}g · {points}p · {handCount}c
      </div>
      <div className="mt-2 flex gap-3 items-center">
        <div className="relative">
          <HandBack count={handCount} />
          {/* role card, offset to the side of the hand */}
          {player.role && (
            <img
              src={roleImg}
              alt="Role"
              className={`absolute -right-8 top-1 w-10 aspect-[2/3] object-cover rounded border border-black/40 shadow-xl ${player.roleRevealed ? '' : 'opacity-90'}`}
              title={player.role?.name}
            />
          )}
        </div>
        <CityFan cards={player.city} />
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
      {/* Viewer HUD */}
      <div className="absolute top-3 left-3 pointer-events-auto z-[200]">
        <div className="bg-black/70 backdrop-blur-md rounded-xl border border-amber-900/30 px-3 py-2 shadow-2xl text-amber-100 font-mono text-xs">
          <div className="font-black tracking-widest text-[10px] uppercase text-amber-400">You</div>
          <div className="mt-0.5">Gold: <b className="text-amber-300">{me?.gold ?? 0}</b>g</div>
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
