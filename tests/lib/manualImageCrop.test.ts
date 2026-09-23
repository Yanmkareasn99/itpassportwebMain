import { describe, expect, it } from 'vitest';
import { groupCropsByTarget, type ManualImageCrop } from '../../src/lib/manualImageCrop';

function crop(id: string, targetId: string): ManualImageCrop {
  return {
    id,
    targetId,
    dataUrl: `data:image/webp;base64,${id}`,
    sizeBytes: id.length,
  };
}

describe('manual PDF image crops', () => {
  it('groups repeated crops by their question or choice target in selection order', () => {
    const questionCropOne = crop('question-1', 'question');
    const choiceCrop = crop('choice-a', 'choice:0');
    const questionCropTwo = crop('question-2', 'question');

    const groups = groupCropsByTarget([
      questionCropOne,
      choiceCrop,
      questionCropTwo,
    ]);

    expect([...groups.keys()]).toEqual(['question', 'choice:0']);
    expect(groups.get('question')).toEqual([questionCropOne, questionCropTwo]);
    expect(groups.get('choice:0')).toEqual([choiceCrop]);
  });
});
