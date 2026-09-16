import { useEffect, useState } from 'react';
import { AnswerChoice, Question } from '../types';
import {
  getAnswerChoiceImageUrl,
  getQuestionImageUrl,
  isImageReference,
} from '../lib/questionImages';

interface QuestionImageProps {
  question: Question | undefined;
}

export function QuestionImage({ question }: QuestionImageProps) {
  const [src, setSrc] = useState<string>();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    setSrc(undefined);
    setFailed(false);
    void getQuestionImageUrl(question).then(url => {
      if (active) setSrc(url);
    });
    return () => { active = false; };
  }, [question]);

  if (!src || failed) return null;

  return (
    <figure className="mt-5 overflow-auto rounded-xl border border-gray-200 bg-white p-3">
      <img
        src={src}
        alt={`Question ${question?.question_number ?? ''} reference diagram`}
        className="mx-auto h-auto max-w-full object-contain"
        loading="lazy"
        decoding="async"
        onError={() => setFailed(true)}
      />
    </figure>
  );
}

interface AnswerChoiceContentProps {
  question: Question | undefined;
  choice: AnswerChoice;
  displayIndex: number;
}

export function AnswerChoiceContent({ question, choice, displayIndex }: AnswerChoiceContentProps) {
  const [src, setSrc] = useState<string>();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    setSrc(undefined);
    setFailed(false);
    void getAnswerChoiceImageUrl(question, choice).then(url => {
      if (active) setSrc(url);
    });
    return () => { active = false; };
  }, [choice, question]);

  const hasImage = Boolean(src && !failed);
  const text = choice.choice_text.trim();
  const showText = text && !isImageReference(text) && !(hasImage && /^[アイウエ]$/.test(text));

  return (
    <span className="flex min-w-0 flex-1 flex-col gap-2">
      {showText && <span className="text-sm text-gray-700">{text}</span>}
      {hasImage && (
        <img
          src={src}
          alt={`Question ${question?.question_number ?? ''}, choice ${displayIndex + 1}`}
          className="max-h-64 max-w-full self-start rounded-lg border border-gray-100 bg-white object-contain p-2"
          loading="lazy"
          decoding="async"
          onError={() => setFailed(true)}
        />
      )}
    </span>
  );
}
