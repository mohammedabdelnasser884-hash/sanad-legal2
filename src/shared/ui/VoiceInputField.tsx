// ══════════════════════════════════════════════════════════════════
// VoiceInputField.tsx — القسم 5.3 من تقرير مستقبل المستندات القانونية
// (Sanad_Legal_Documents_Master_Report.md، أولوية 2)
//
// Wrapper عام حوالين أي <input>/<textarea> موجود بالفعل — بيضيف زرار
// مايك عائم بيستخدم Web Speech API (مفيش تكلفة API خارجية، ومفيش
// اعتماد على نت غير اللي المتصفح نفسه محتاجه للتعرف على الصوت).
//
// ⚠️ الاستخدام: لف الـ<textarea>/<input> الموجود زي ما هو من غير أي
// تغيير في الـstyling أو الـprops بتاعته، ومرر onTranscript عشان تلحق
// النص المتعرَّف عليه بالقيمة الحالية للحقل. الحقل الأصلي يفضل شغال
// عادي (كتابة يدوية) حتى لو المايك مش مدعوم في المتصفح.
//
// ⚠️ دعم المتصفح: Web Speech API (SpeechRecognition) مش متاح في كل
// المتصفحات (خصوصًا Firefox، وبعض متصفحات الموبايل). لو مش مدعوم،
// الزرار مش بيظهر خالص — الحقل الأصلي بيفضل شغال عادي بالكتابة اليدوية
// من غير أي تغيير. جودة التعرف على اللهجة المصرية لسه محتاجة اختبار
// فعلي قبل الاعتماد عليها بالكامل (موثّق كملاحظة مفتوحة في التقرير).
// ══════════════════════════════════════════════════════════════════

import React, { useRef, useState, useCallback, useEffect } from 'react';

// أنواع Web Speech API مش موجودة في lib.dom.d.ts القياسية في كل إعدادات
// TS، فبنعرّف الحد الأدنى المحتاج هنا بس (بدون أي مكتبة خارجية إضافية)
interface MinimalSpeechRecognitionEvent {
  results: ArrayLike<ArrayLike<{ transcript: string }>>;
}
interface MinimalSpeechRecognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: MinimalSpeechRecognitionEvent) => void) | null;
  onerror: ((event: unknown) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}

function getSpeechRecognitionCtor(): (new () => MinimalSpeechRecognition) | null {
  const w = window as unknown as {
    SpeechRecognition?: new () => MinimalSpeechRecognition;
    webkitSpeechRecognition?: new () => MinimalSpeechRecognition;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

interface VoiceInputFieldProps {
  /** الحقل الأصلي (textarea أو input) — بيتعرض زي ما هو من غير أي تغيير */
  children: React.ReactNode;
  /** بينادى بالنص المتعرَّف عليه (نهائي بس، مش interim) عشان تلحقه بقيمة الحقل */
  onTranscript: (text: string) => void;
  /** اختياري — تعطيل الزرار (مثلاً الحقل نفسه disabled) */
  disabled?: boolean;
  testId?: string;
}

export default function VoiceInputField({ children, onTranscript, disabled, testId }: VoiceInputFieldProps) {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef<MinimalSpeechRecognition | null>(null);

  useEffect(() => {
    setSupported(getSpeechRecognitionCtor() !== null);
  }, []);

  useEffect(() => {
    // إيقاف التسجيل تلقائيًا لو الفورم اتقفل/الكومبوننت اتشال وهو لسه شغال
    return () => {
      recognitionRef.current?.stop();
    };
  }, []);

  const handleToggle = useCallback(() => {
    if (disabled) return;

    if (listening) {
      recognitionRef.current?.stop();
      setListening(false);
      return;
    }

    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) return;

    const recognition = new Ctor();
    recognition.lang = 'ar-EG';
    recognition.continuous = false;
    recognition.interimResults = false;

    recognition.onresult = (event) => {
      const lastResultIndex = event.results.length - 1;
      const transcript = event.results[lastResultIndex]?.[0]?.transcript;
      if (transcript) onTranscript(transcript);
    };
    recognition.onerror = () => setListening(false);
    recognition.onend = () => setListening(false);

    recognitionRef.current = recognition;
    setListening(true);
    recognition.start();
  }, [listening, disabled, onTranscript]);

  return (
    <div className="relative">
      {children}
      {supported && (
        <button
          type="button"
          data-testid={testId}
          onClick={handleToggle}
          disabled={disabled}
          aria-label={listening ? 'إيقاف الإدخال الصوتي' : 'إدخال صوتي'}
          title={listening ? 'إيقاف الإدخال الصوتي' : 'إدخال صوتي'}
          className={`absolute bottom-2 left-2 w-7 h-7 rounded-full flex items-center justify-center transition-all disabled:opacity-40 ${
            listening ? 'bg-rose-500/20 text-rose-300 animate-pulse' : 'bg-white/10 text-slate-300 hover:bg-white/20'
          }`}
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth="1.75" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 0 0 6-6v-1.5m-6 7.5a6 6 0 0 1-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 0 1-3-3V4.5a3 3 0 1 1 6 0v8.25a3 3 0 0 1-3 3Z" />
          </svg>
        </button>
      )}
    </div>
  );
}
