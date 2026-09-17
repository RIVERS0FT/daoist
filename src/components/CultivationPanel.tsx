import { useState } from 'react';
import { breakthroughPreview, cultivationGain, cultivationPlan, ITEMS, MANUALS, mastery, maxMana, realmName, timePreview, TRIAL_STAGES } from '../game/cultivation';
import type { CultivationCommand } from '../game/cultivation';
import { useGameStore } from '../game/store';
import '../cultivation.css';

function CultAction({ command, title, detail = '' }: { command: CultivationCommand; title: string; detail?: string }) {
  const game = useGameStore(s => s.game), cultivate = useGameStore(s => s.cultivate);
  const locked = useGameStore(s => Boolean(s.play.pending || s.play.scene || s.loadBlocked || s.slotBusy || s.saveStatus !== 'saved'));
  const plan = cultivationPlan(game, command);
  const cost = [`${plan.minutes} 分钟`, plan.energy ? `精力 -${plan.energy}` : '', plan.mana ? `法力 -${plan.mana}` : '', plan.money ? `¥${plan.money}` : ''].filter(Boolean).join(' · ');
  return <div className="cult-action"><button type="button" className="action-button" disabled={locked || Boolean(plan.reason)} onClick={() => cultivate(command)}>
    <span>{title}</span><small>{cost}{detail ? ` · ${detail}` : ''}</small>
  </button>{plan.reason ? <p className="cult-reason">{plan.reason}</p> : <p className="cult-time">{timePreview(game, plan.minutes)}</p>}</div>;
}
export function CultivationPanel() {
  const game = useGameStore(s => s.game), c = game.cultivation;
  const [tab, setTab] = useState('practice'), [strategy, setStrategy] = useState<'steady' | 'risk'>('steady'), [aid, setAid] = useState(false);
  const p = breakthroughPreview(game, strategy, aid), manual = MANUALS.find(m => m.id === c.main)!;
  const trial = c.trial ? TRIAL_STAGES[c.trial.stage] : null;
  return <section className="panel cultivation-panel" aria-label="修仙手记">
    <div className="cult-hero"><span className="eyebrow">以人间为道场</span><h3>{realmName(game.realmLevel)}</h3><p>主修 · {manual.name}</p><div className="cult-metrics"><span>灵气 <b>{game.qi}</b></span><span>法力 <b>{c.mana}/{maxMana(game.realmLevel)}</b></span><span>熟练 <b>{mastery(game)}/100</b></span><span>准备 <b>{c.preparation}/100</b></span></div></div>
    {trial && c.trial ? <article className="cult-card foundation-trial" aria-label="内景筑基试炼">
      <span className="eyebrow">内景试炼 · {c.trial.stage + 1} / 3 · 已稳住 {c.trial.composure} 次</span><h3>{trial.title}</h3><p>{trial.text}</p>
      <p className="panel-note">至少两次循序守心才能通过。每段选择自动保存；不改变地图位置。无法继续时可退出，休养后重试。</p>
      <CultAction command={{ type: 'trial-choice', choice: 'steady', stage: c.trial.stage }} title={trial.steady} detail="守心 +1" />
      <CultAction command={{ type: 'trial-choice', choice: 'rush', stage: c.trial.stage }} title={trial.rush} detail="节省时间，不增加守心" />
      <CultAction command={{ type: 'trial-exit' }} title="退出内景试炼" detail="无资源门槛 · 已投入的时间不返还" />
    </article> : <>
      <nav className="cult-tabs" aria-label="修仙功能">{[['practice','修行'],['manuals','功法'],['breakthrough','破境'],['items','药符']].map(([id,label]) => <button key={id} type="button" aria-pressed={tab === id} onClick={() => setTab(id)}>{label}</button>)}</nav>
      {tab === 'practice' && <div>
        <p className="cult-guide">{game.realmLevel === 0 ? '入门：吐纳积累 30 灵气 → 行功提高熟练度 → 两次稳固周天 → 稳妥突破必成。' : game.realmLevel < 9 ? '积累灵气，练熟主修功法，保持身体和准备度。突破失败不降境界，并保留瓶颈经验。' : game.realmLevel === 9 ? '炼气圆满：准备 400 灵气，完成内景试炼，再冲击筑基。' : '已踏入筑基初期。本版仍可修行、经营生活与人物关系，不强制结束这一世。'}</p>
        <div className="action-grid"><CultAction command={{ type: 'meditate', hours: 1 }} title="吐纳一小时" detail={`预计灵气 +${cultivationGain(game,60)}`} />
          <CultAction command={{ type: 'meditate', hours: 3 }} title="闭关三小时" detail="每小时结算，遇剧情或身体崩溃即停止" />
          <CultAction command={{ type: 'train' }} title="行功练习" detail="主修熟练度 +8" />
          <CultAction command={{ type: 'study' }} title="整理修炼笔记" detail="悟性 +1 · 主修熟练度提升" />
          <CultAction command={{ type: 'breathe' }} title="调息恢复法力" detail={`法力 +${c.main === 'breath' ? 20 : 15} · 压力 -4`} />
          <CultAction command={{ type: 'prepare' }} title="稳固周天" detail="突破准备度 +25" />
        </div><p className="panel-note">灵气用于突破，法力用于施术与准备。所有时间都由行动推进，等待和关闭网页没有挂机收益。</p>
        {c.main === 'wind' && <CultAction command={{ type: 'light-steps' }} title="施展轻身术" detail={`两次成功骑行少耗精力，剩余 ${c.lightSteps} 次`} />}
      </div>}
      {tab === 'manuals' && <div className="cult-cards"><p className="panel-note">只生效一门主修，不叠加其他功法效果。改修保留熟练度，解除未用完的轻身术。剧情模式不会因此改变。</p>{MANUALS.map(m => <article className="cult-card" key={m.id}>
        <div className="cult-card-heading"><h3>{m.name}</h3><span>{c.main === m.id ? '主修中' : c.manuals[m.id] === null ? '未入门' : `熟练 ${c.manuals[m.id]}/100`}</span></div><p>{m.description}</p>
        {c.manuals[m.id] === null ? <CultAction command={{ type:'learn', id:m.id }} title={`研习${m.name}`} detail="获得功法，不自动改修" /> : c.main !== m.id ? <CultAction command={{ type:'equip', id:m.id }} title={`主修${m.name}`} /> : <p className="cult-time">当前熟练度 {mastery(game)}/100 · 可在修行页行功</p>}
      </article>)}</div>}
      {tab === 'breakthrough' && <div className="cult-cards">
        <article className="cult-card"><h3>{game.realmLevel >= 10 ? '筑基初期 · 本版已开放上限' : `下一境界 · ${realmName(game.realmLevel + 1)}`}</h3>
          <p>灵气 {game.qi}/{p.qi} · 法力 {c.mana}/{p.mana} · 准备 {c.preparation}/100</p>
          <p>健康 {game.health}/100 · 压力 {game.stress}/100 · 本瓶颈经验 {c.failures}/5</p>
          <fieldset className="cult-strategies"><legend>突破方式（查看不消耗资源）</legend><label><input type="radio" name="breakthrough-strategy" checked={strategy === 'steady'} onChange={() => setStrategy('steady')} />稳妥突破 · 更多准备与时间</label><label><input type="radio" name="breakthrough-strategy" checked={strategy === 'risk'} onChange={() => setStrategy('risk')} />强行冲关 · 更短时间、更高风险</label></fieldset>
          <label className="cult-aid"><input type="checkbox" checked={aid} onChange={e => setAid(e.target.checked)} />使用一张护脉符（持有 {c.inventory.talisman}）</label>
          <div className="cult-probability" aria-label="突破成功率"><strong>{Math.round(p.chance * 100)}%</strong><span>{p.first ? '入门稳妥突破：条件齐全后必成' : '本地规则计算 · 预览不抽随机数'}</span></div>
          <p className="panel-note">稳妥方式需准备 ≥50、压力 ≤70、主修熟练度 ≥{8 + game.realmLevel * 4}。失败退回一半灵气，不降境界；消耗法力、时间及已选护脉符，准备度减半，健康损失 {strategy === 'steady' ? 6 : 14}，压力 +10。</p>
          <CultAction command={{ type: 'breakthrough', strategy, aid }} title={game.realmLevel >= 10 ? '已达本版境界上限' : strategy === 'steady' ? '确认稳妥突破' : '确认强行冲关'} detail={`灵气 -${p.qi}${aid ? ' · 护脉符 -1' : ''}`} />
        </article>
        {game.realmLevel >= 9 && <article className="cult-card"><h3>内景筑基试炼</h3><p>{c.trialPassed ? '已通过，结果随存档保留。无需重复试炼，可以准备筑基突破。' : '三段听息、守心、合流。至少两次循序选择才能通过；每段均可保存恢复，始终可以退出。'}</p><CultAction command={{ type: 'trial-start' }} title={c.trialPassed ? '筑基试炼已完成' : '开始内景筑基试炼'} detail="需炼气九层、健康 ≥60" /></article>}
      </div>}
      {tab === 'items' && <div className="cult-cards"><p className="panel-note">材料和药符最高各持有 99。今日药食 {c.medicineDay === game.day ? c.medicineUses : 0}/3 次；调息不受药食限制。购买、辨药不改变地图位置。</p>
        <article className="cult-card"><h3>辨药与简易炼制</h3><CultAction command={{ type: 'gather' }} title="辨识药草" detail="青息草 +1 · 不花钱" /><CultAction command={{ type: 'craft', id: 'pill' }} title="调制归元散" detail="青息草 -2" /><CultAction command={{ type: 'craft', id: 'talisman' }} title="绘制护脉符" detail="青息草 -1 · 素符纸 -2 · 符解熟练 ≥20" /></article>
        {ITEMS.map(i => <article className="cult-card" key={i.id}><div className="cult-card-heading"><h3>{i.name}</h3><span>持有 {c.inventory[i.id]}</span></div><p>{i.description}</p><CultAction command={{ type:'buy', id:i.id }} title={`购买${i.name}`} />{(i.id === 'pill' || i.id === 'tea') && <CultAction command={{ type:'use', id:i.id }} title={`使用${i.name}`} />}</article>)}
      </div>}
    </>}
  </section>;
}
