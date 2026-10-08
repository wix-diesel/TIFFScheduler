import type { OptimizationObjective } from '../scheduler/types.ts';

export const OBJECTIVES: Record<OptimizationObjective, { label: string; hint: string; priorities: string }> = {
  maxFilms: {
    label: '鑑賞本数を最大化',
    hint: '鑑賞本数を最大にし、同じ本数なら必要休暇量を減らします。',
    priorities: '鑑賞数 → 必要休暇量',
  },
  balanced: {
    label: '鑑賞本数と休暇のバランス',
    hint: '見送る1作品と休暇0.5日をそれぞれ1点とし、合計が少ない案を優先します。同点なら鑑賞本数を増やします。1日の休暇で2作品以上見られる日を選びやすく、1作品だけのための終日休暇は避けやすくなります。',
    priorities: '見送り数＋休暇0.5日単位 → 鑑賞数 → 必要休暇量',
  },
  minVacation: {
    label: '休暇日数を最小化',
    hint: '必要休暇量を最小にし、同じ休暇量なら鑑賞本数を増やします。選択した作品を見送る場合があります。',
    priorities: '必要休暇量 → 鑑賞数',
  },
};
