import { useState } from 'react';
import { breakthroughPreview, cultivationGain, ITEMS, MANUALS, mastery, maxMana, realmName, timePreview, TRIAL_STAGES } from '../game/cultivation';
import type { CultivationCommand } from '../game/cultivation';
import { useGameStore } from '../game/store';
import { cultivationActionPlan } from '../game/engine';
import { previewAfterTravel } from '../game/travel';
import '../cultivation.css';

function CultAction({ command, title, detail = '', preferred = null }: { command: CultivationCommand; title: string; detail?: string; preferred?: string | null }) {
  const game = useGameStore(s => s.game), cultivate = useGameStore(s => s.cultivate);
  const locked = useGameStore(s => Boolean(s.play.pending || s.play.scene || s.loadBlocked || s.slotBusy || s.saveStatus !== 'saved'));
  const plan = cultivationActionPlan(game, command, preferred);
  const travel = plan.travelMinutes ? `路程 ${plan.distanceKm.toFixed(1)} km / ${plan.travelMinutes} 分钟` : '';
  const cost = [`${plan.totalMinutes} 分钟`, travel, plan.energy ? `精力 -${plan.energy}` : '', plan.mana ? `法力 -${plan.mana}` : '', plan.money ? `¥${plan.money}` : ''].filter(Boolean).join(' · ');
  return <div className="cult-action"><button type="button" className="action-button" disabled={locked || Boolean(plan.reason)} onClick={() => cultivate(command, preferred)}>
    <span>{title}</span><small>{cost}{detail ? ` · ${detail}` : ''}</small>
  </button>{plan.reason ? <p className="cult-reason">{plan.reason}</p> : <p className="cult-time">{timePreview(game, plan.totalMinutes)}</p>}</div>;
}
export function CultivationPanel({ preferred = null }: { preferred?: string | null }) {
  const game = useGameStore(s => s.game), c = game.cultivation;
  const [tab, setTab] = useState('practice'), [strategy, setStrategy] = useState<'steady' | 'risk'>('steady'), [aid, setAid] = useState(false);
  const breakthroughTravel = cultivationActionPlan(game, { type: 'breakthrough', strategy, aid }, preferred);
  const p = breakthroughPreview(previewAfterTravel(game, breakthroughTravel.destinationId), strategy, aid), manual = MANUALS.find(m => m.id === c.main)!;
  const trial = c.trial ? TRIAL_STAGES[c.trial.stage] : null;
  return <section className="panel cultivation-panel" aria-label="修仙手记">
    <div className="cult-hero"><h3>{realmName(game.realmLevel)}</h3><p>主修 · {manual.name}</p><div className="cult-metrics"><span>灵气 <b>{game.qi}</b></span><span>法力 <b>{c.mana}/{maxMana(game.realmLevel)}</b></span><span>熟练 <b>{mastery(game)}/100</b></span><span>准备 <b>{c.preparation}/100</b></span></div></div>
    {trial && c.trial ? <article className="cult-card foundation-trial" aria-label="内景筑基试炼">
      <span className="eyebrow">内景试炼 · {c.trial.stage + 1} / 3 · 守心 {c.trial.composure}</span><h3>{trial.title}</h3><p>{trial.text}</p>
      <CultAction preferred={preferred} command={{ type: 'trial-choice', choice: 'steady', stage: c.trial.stage }} title={trial.steady} detail="守心 +1" />
      <CultAction preferred={preferred} command={{ type: 'trial-choice', choice: 'rush', stage: c.trial.stage }} title={trial.rush} detail="不增加守心" />
      <CultAction preferred={preferred} command={{ type: 'trial-exit' }} title="退出内景试炼" detail="无资源门槛" />
    </article> : <>
      <nav className="cult-tabs" aria-label="修仙功能">{[['practice','修行'],['manuals','功法'],['breakthrough','破境'],['items','药符']].map(([id,label]) => <button key={id} type="button" aria-pressed={tab === id} onClick={() => setTab(id)}>{label}</button>)}</nav>
      {tab === 'practice' && <div>
        <div className="action-grid"><CultAction preferred={preferred} command={{ type: 'meditate', hours: 1 }} title="吐纳一小时" detail={`预计灵气 +${cultivationGain(previewAfterTravel(game, cultivationActionPlan(game, { type: 'meditate', hours: 1 }, preferred).destinationId),60)}`} />
          <CultAction preferred={preferred} command={{ type: 'meditate', hours: 3 }} title="闭关三小时" detail="逐小时结算" />
          <CultAction preferred={preferred} command={{ type: 'train' }} title="行功练习" detail="熟练度 +8" />
          <CultAction preferred={preferred} command={{ type: 'study' }} title="整理修炼笔记" detail="悟性 +1 · 提升熟练" />
          <CultAction preferred={preferred} command={{ type: 'breathe' }} title="调息" detail={`法力 +${c.main === 'breath' ? 20 : 15} · 压力 -4`} />
          <CultAction preferred={preferred} command={{ type: 'prepare' }} title="稳固周天" detail="准备 +25" />
        </div>
        {c.main === 'wind' && <CultAction preferred={preferred} command={{ type: 'light-steps' }} title="施展轻身术" detail={`剩余 ${c.lightSteps} 次`} />}
      </div>}
      {tab === 'manuals' && <div className="cult-cards">{MANUALS.map(m => <article className="cult-card" key={m.id}>
        <div className="cult-card-heading"><h3>{m.name}</h3><span>{c.main === m.id ? '主修中' : c.manuals[m.id] === null ? '未入门' : `熟练 ${c.manuals[m.id]}/100`}</span></div><p>{m.description}</p>
        {c.manuals[m.id] === null ? <CultAction preferred={preferred} command={{ type:'learn', id:m.id }} title={`研习${m.name}`} detail="获得功法" /> : c.main !== m.id ? <CultAction preferred={preferred} command={{ type:'equip', id:m.id }} title={`主修${m.name}`} /> : <p className="cult-time">当前熟练度 {mastery(game)}/100</p>}
      </article>)}</div>}
      {tab === 'breakthrough' && <div className="cult-cards">
        <article className="cult-card"><h3>{game.realmLevel >= 10 ? '筑基初期 · 当前上限' : `下一境界 · ${realmName(game.realmLevel + 1)}`}</h3>
          <p>灵气 {game.qi}/{p.qi} · 法力 {c.mana}/{p.mana} · 准备 {c.preparation}/100</p>
          <p>健康 {game.health}/100 · 压力 {game.stress}/100 · 瓶颈经验 {c.failures}/5</p>
          <fieldset className="cult-strategies"><legend>突破方式</legend><label><input type="radio" name="breakthrough-strategy" checked={strategy === 'steady'} onChange={() => setStrategy('steady')} />稳妥突破</label><label><input type="radio" name="breakthrough-strategy" checked={strategy === 'risk'} onChange={() => setStrategy('risk')} />强行冲关</label></fieldset>
          <label className="cult-aid"><input type="checkbox" checked={aid} onChange={e => setAid(e.target.checked)} />使用护脉符（持有 {c.inventory.talisman}）</label>
          <div className="cult-probability" aria-label="突破成功率"><strong>{Math.round(p.chance * 100)}%</strong><span>{p.first ? '稳妥入门条件齐全后必成' : '成功率预览'}</span></div>
          <p className="panel-note">稳妥条件：准备 ≥50 · 压力 ≤70 · 熟练 ≥{8 + game.realmLevel * 4}</p>
          <CultAction preferred={preferred} command={{ type: 'breakthrough', strategy, aid }} title={game.realmLevel >= 10 ? '已达境界上限' : strategy === 'steady' ? '确认稳妥突破' : '确认强行冲关'} detail={`灵气 -${p.qi}${aid ? ' · 护脉符 -1' : ''}`} />
        </article>
        {game.realmLevel >= 9 && <article className="cult-card"><h3>内景筑基试炼</h3><p>{c.trialPassed ? '已通过' : '三段试炼 · 至少守心两次'}</p><CultAction preferred={preferred} command={{ type: 'trial-start' }} title={c.trialPassed ? '筑基试炼已完成' : '开始内景筑基试炼'} detail="需炼气九层 · 健康 ≥60" /></article>}
      </div>}
      {tab === 'items' && <div className="cult-cards"><div className="info-row"><span>今日药食 {c.medicineDay === game.day ? c.medicineUses : 0}/3</span></div>
        <article className="cult-card"><h3>辨药与炼制</h3><CultAction preferred={preferred} command={{ type: 'gather' }} title="辨识药草" detail="青息草 +1" /><CultAction preferred={preferred} command={{ type: 'craft', id: 'pill' }} title="调制归元散" detail="青息草 -2" /><CultAction preferred={preferred} command={{ type: 'craft', id: 'talisman' }} title="绘制护脉符" detail="青息草 -1 · 素符纸 -2 · 符解熟练 ≥20" /></article>
        {ITEMS.map(i => <article className="cult-card" key={i.id}><div className="cult-card-heading"><h3>{i.name}</h3><span>持有 {c.inventory[i.id]}</span></div><p>{i.description}</p><CultAction preferred={preferred} command={{ type:'buy', id:i.id }} title={`购买${i.name}`} />{(i.id === 'pill' || i.id === 'tea') && <CultAction preferred={preferred} command={{ type:'use', id:i.id }} title={`使用${i.name}`} />}</article>)}
      </div>}
    </>}
  </section>;
}
