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
    <div className="relative h-10 w-12">
      {Array.from({ length: n }).map((_, i) => (
        <img
          key={i}
          src="/assets/ui/building_back.jpg"
          alt=""
          className="absolute top-0 w-8 aspect-[2/3] object-cover rounded border border-black/40 shadow-lg"
          style={{ left: `${i * 6}px`, zIndex: i }}
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
  const score = (player.city || []).reduce((acc, c) => acc + (c.cost || 0), 0);
  const roleImg = player.role?.img || "/assets/ui/character_back.jpg";

  return (
    <div className={`bg-black/60 backdrop-blur-md rounded-2xl border transition-all duration-500 p-3 min-w-[200px] shadow-2xl flex flex-col gap-2 ${isActive ? 'border-amber-400 scale-110' : 'border-amber-900/30'}`}>
      <div className="flex items-center justify-between border-b border-amber-900/20 pb-1">
        <div className="font-serif font-black text-amber-200 uppercase tracking-widest text-[9px] flex items-center gap-2">
          <div className="w-4 h-4 rounded-full bg-amber-950 flex items-center justify-center text-amber-600 text-[8px] border border-amber-900/50">
            {player.name[0].toUpperCase()}
          </div>
          <span className="truncate w-20">{player.name}</span>
        </div>
        <div className="text-[9px] font-mono text-amber-500 bg-black/40 px-2 py-0.5 rounded border border-amber-900/10">
          {player.gold}g | {score}p
        </div>
      </div>
      <div className="flex gap-4 items-center">
        <div className="relative group">
           <img 
             src={roleImg} 
             alt="Role" 
             className={`w-10 aspect-[2/3] object-cover rounded border-2 transition-all ${isActive ? 'border-amber-400 shadow-[0_0_15px_rgba(251,191,36,0.5)]' : 'border-black/40 opacity-50'}`} 
           />
           {isActive && <div className="absolute -top-1 -right-1 w-2 h-2 bg-amber-400 rounded-full animate-ping"></div>}
        </div>
        <div className="flex-1 flex gap-2 items-center">
            <StaggeredBacks count={handCount} />
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
