import { useState, useRef, useCallback, useEffect } from 'react';

// ══════════════════════════════════════════════════════════════
//  useVoiceSearch — "بحث صوتي" في صندوق البحث الشامل (سبتمبر 2026)
//  ⚡ بيستخدم Web Speech API المدمجة في المتصفح مباشرة (SpeechRecognition/
//  webkitSpeechRecognition) — مفيش أي مكتبة خارجية، مفيش API مدفوع، مفيش
//  أي تعديل في السيرفر. التعرف على الصوت بيحصل جوه المتصفح نفسه (أو
//  بخدمة المتصفح السحابية زي Chrome)، إحنا بس بنستقبل النص الناتج.
//
//  ⚠️ قيود حقيقية لازم تُعرض للمستخدم (مش تتخبى):
//  - شغالة في Chrome / Edge / Safari (موبايل وديسكتوب). مش شغالة في
//    Firefox خالص — المتصفح مش بيدعم الـAPI دي أصلاً.
//  - محتاجة HTTPS (أو localhost وقت التطوير).
//  - دقة التعرف على العربي بتفرق حسب المتصفح/نضافة الصوت، وممكن تقل مع
//    مصطلحات قانونية أو أسماء غير شائعة — مفيش ضمان مثالي.
//  - أول استخدام هيطلب إذن الميكروفون من المتصفح (بعدها بيتفتكر).
// ══════════════════════════════════════════════════════════════

// أنواع مبسّطة للـWeb Speech API — مش موجودة في lib.dom.d.ts الافتراضية
// بتاعة TypeScript، فبنعرّف الحد الأدنى اللي محتاجينه بس.
interface MinimalSpeechRecognitionResult {
    0: { transcript: string };
    isFinal: boolean;
}
interface MinimalSpeechRecognitionEvent {
    resultIndex: number;
    results: MinimalSpeechRecognitionResult[] & { length: number };
}
interface MinimalSpeechRecognition {
    lang: string;
    continuous: boolean;
    interimResults: boolean;
    onresult: ((e: MinimalSpeechRecognitionEvent) => void) | null;
    onerror: ((e: { error: string }) => void) | null;
    onend: (() => void) | null;
    start: () => void;
    stop: () => void;
    abort: () => void;
}
type SpeechRecognitionCtor = new () => MinimalSpeechRecognition;

function getSpeechRecognitionCtor(): SpeechRecognitionCtor | null {
    if (typeof window === 'undefined') return null;
    const w = window as unknown as Record<string, unknown>;
    return (w.SpeechRecognition || w.webkitSpeechRecognition || null) as SpeechRecognitionCtor | null;
}

interface UseVoiceSearchOptions {
    // بيتنادى بالنص كل ما يتحدّث أثناء الاستماع (نتيجة جزئية أو نهائية) —
    // عشان يتحط في صندوق البحث لحظة بلحظة زي لو المستخدم بيكتب بإيده.
    onTranscript: (text: string) => void;
}

export function useVoiceSearch({ onTranscript }: UseVoiceSearchOptions) {
    const [listening, setListening] = useState(false);
    const [voiceError, setVoiceError] = useState<string | null>(null);
    const recognitionRef = useRef<MinimalSpeechRecognition | null>(null);

    // الدعم بيتحدد مرة واحدة بس (المتصفح مش بيتغير أثناء الجلسة)
    const isSupported = getSpeechRecognitionCtor() !== null;

    const stop = useCallback(() => {
        recognitionRef.current?.stop();
        setListening(false);
    }, []);

    const start = useCallback(() => {
        const Ctor = getSpeechRecognitionCtor();
        if (!Ctor) {
            setVoiceError('البحث الصوتي مش مدعوم في هذا المتصفح');
            return;
        }
        setVoiceError(null);
        const recognition = new Ctor();
        recognition.lang = 'ar-EG';
        recognition.continuous = true;
        recognition.interimResults = true;

        recognition.onresult = (e: MinimalSpeechRecognitionEvent) => {
            let combined = '';
            for (let i = 0; i < e.results.length; i++) {
                combined += e.results[i][0].transcript;
            }
            onTranscript(combined);
        };
        recognition.onerror = (e: { error: string }) => {
            // 'no-speech' بيحصل عادي لو سكت المستخدم شوية — مش خطأ حقيقي
            // يستاهل رسالة، الاستماع بيقفل عادي من onend.
            if (e.error !== 'no-speech') {
                setVoiceError(
                    e.error === 'not-allowed' || e.error === 'permission-denied'
                        ? 'محتاجين إذن الميكروفون عشان البحث الصوتي يشتغل'
                        : 'حصلت مشكلة في البحث الصوتي — جرّب تاني'
                );
            }
            setListening(false);
        };
        recognition.onend = () => setListening(false);

        recognitionRef.current = recognition;
        setListening(true);
        recognition.start();
    }, [onTranscript]);

    const toggle = useCallback(() => {
        if (listening) stop(); else start();
    }, [listening, start, stop]);

    // إيقاف الاستماع لو الكومبوننت اتقفل وهو لسه شغال (فتح/قفل المودال)
    useEffect(() => () => { recognitionRef.current?.abort(); }, []);

    return { isSupported, listening, voiceError, toggle };
}
