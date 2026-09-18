import {
  currentSystemChapter,
  SYSTEM_ACHIEVEMENTS,
  SYSTEM_CHAPTERS,
  SYSTEM_EXCHANGES,
  SYSTEM_MISSIONS,
  systemAchievementState,
  systemExchangePlan,
  systemMissionState,
} from '../game/system';
import { useGameStore } from '../game/store';

export function SystemPanel() {
  const game = useGameStore((state) => state.game);
  const slotBusy = useGameStore((state) => state.slotBusy);
  const loadBlocked = useGameStore((state) => state.loadBlocked);
  const saveStatus = useGameStore((state) => state.saveStatus);
  const exchangeSystemItem = useGameStore((state) => state.exchangeSystemItem);
  const claimSystemMission = useGameStore((state) => state.claimSystemMission);
  const claimSystemAchievement = useGameStore((state) => state.claimSystemAchievement);
  const story = currentSystemChapter(game);
  const writeBlocked = slotBusy || loadBlocked || saveStatus === 'error';
  const readyMissions = SYSTEM_MISSIONS.filter((entry) => {
    const state = systemMissionState(game, entry.id);
    return state.complete && !state.claimed && !state.reason;
  }).length;
  const readyAchievements = SYSTEM_ACHIEVEMENTS.filter((entry) => {
    const state = systemAchievementState(game, entry.id);
    return state.complete && !state.claimed && !state.reason;
  }).length;

  return <section className="panel system-panel">
    <div className="system-balance">
      <div><span className="eyebrow">配送修仙系统 · 阶段 {story.unlocked}</span><h3>系统中枢</h3></div>
      <strong>{game.deliveryCoins}<small> 币</small></strong>
    </div>

    <article className="system-story">
      <span className="eyebrow">{story.chapter.title}</span>
      <h3>{story.chapter.subtitle}</h3>
      <p>{story.chapter.text}</p>
      <details className="system-story-history">
        <summary>已解锁系统纪事 · {story.unlocked}/{SYSTEM_CHAPTERS.length}</summary>
        <ol>{SYSTEM_CHAPTERS.filter((chapter) => chapter.condition(game)).map((chapter) =>
          <li key={chapter.id}><strong>{chapter.title}</strong><span>{chapter.subtitle}</span></li>)}</ol>
      </details>
    </article>

    <details className="system-section" open>
      <summary><strong>系统任务</strong><span>{readyMissions ? `${readyMissions} 项可领取` : '随进度解锁'}</span></summary>
      <div className="system-task-list">
        {SYSTEM_MISSIONS.map((mission) => {
          const state = systemMissionState(game, mission.id);
          return <article className={`system-task ${state.complete ? 'complete' : ''} ${state.claimed ? 'claimed' : ''}`} key={mission.id}>
            <div className="system-task-head"><div><h3>{mission.title}</h3><p>{mission.description}</p></div><strong>{mission.progress(game)}</strong></div>
            <div className="system-task-foot"><span>奖励 · {mission.reward.label}</span>
              <button type="button" disabled={writeBlocked || Boolean(state.reason)} onClick={() => claimSystemMission(mission.id)}>
                {state.claimed ? '已领取' : state.complete ? '领取' : '未完成'}
              </button>
            </div>
            {state.reason && state.complete && !state.claimed && <small className="system-lock">{state.reason}</small>}
          </article>;
        })}
      </div>
    </details>

    <details className="system-section">
      <summary><strong>系统成就</strong><span>{readyAchievements ? `${readyAchievements} 项可领取` : '含隐藏成就'}</span></summary>
      <div className="system-task-list">
        {SYSTEM_ACHIEVEMENTS.map((achievement) => {
          const state = systemAchievementState(game, achievement.id);
          const hidden = achievement.hidden && !state.complete && !state.claimed;
          return <article className={`system-task achievement ${state.complete ? 'complete' : ''} ${state.claimed ? 'claimed' : ''}`} key={achievement.id}>
            {hidden ? <><div className="system-task-head"><div><h3>隐藏成就 · ？？？</h3><p>满足某个世界条件后才会显现。</p></div><strong>未发现</strong></div></> : <>
              <div className="system-task-head"><div><h3>{achievement.title}</h3><p>{achievement.description}</p></div><strong>{state.complete ? '已达成' : '进行中'}</strong></div>
              <div className="system-task-foot"><span>奖励 · {achievement.reward.label}</span>
                <button type="button" disabled={writeBlocked || Boolean(state.reason)} onClick={() => claimSystemAchievement(achievement.id)}>
                  {state.claimed ? '已领取' : state.complete ? '领取' : '未达成'}
                </button>
              </div>
              {state.reason && state.complete && !state.claimed && <small className="system-lock">{state.reason}</small>}
            </>}
          </article>;
        })}
      </div>
    </details>

    <details className="system-section system-shop" open>
      <summary><strong>外卖币兑换</strong><span>系统直发 · 0 分钟</span></summary>
      <p className="system-note">兑换直接在系统界面完成，不需要前往任何地点，也不会推进游戏时间或改变玩家位置。</p>
      <div className="system-shop-grid">
        {SYSTEM_EXCHANGES.map((entry) => {
          const plan = systemExchangePlan(game, entry.id);
          return <article className="system-item" key={entry.id}>
            <div className="system-item-head"><div><span>{entry.tier}</span><h3>{entry.name}</h3></div><strong>×{entry.quantity}</strong></div>
            <p>{entry.description}</p>
            <div className="system-item-meta"><span>{entry.cost} 外卖币</span><span>即时到账</span>{entry.unlockOrders > 0 && <span>{entry.unlockOrders} 单解锁</span>}</div>
            {plan.reason && <small className="system-lock">{plan.reason}</small>}
            <button type="button" className="primary-button system-exchange-button" disabled={writeBlocked || Boolean(plan.reason)} onClick={() => exchangeSystemItem(entry.id)}>兑换</button>
          </article>;
        })}
      </div>
    </details>
  </section>;
}
