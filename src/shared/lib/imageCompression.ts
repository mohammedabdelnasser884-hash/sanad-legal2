// ضغط الصور على جهاز المستخدم قبل الرفع (موبايل أو ديسكتوب — نفس الكود
// لكل الأجهزة، مبني على Canvas API القياسي في المتصفح، من غير أي مكتبة
// خارجية جديدة).
//
// ⚠️ السبب: صور البطاقة الشخصية/التوكيل بتترفع زي ما هي من كاميرا
// الموبايل (غالبًا 4-10 ميجا للصورة الواحدة). مع 3 صور لكل موكل (بطاقة
// وش/ضهر + توكيل) × عدد كبير من الموكلين عبر عدة مكاتب، ده استهلاك
// تخزين ضخم لبند بسيط (بيانات نصية أساسًا). الحل: تصغير أبعاد الصورة
// لحد أقصى معقول للقراءة + ضغط الجودة، قبل استدعاء storage.upload()
// مباشرة — بدون أي تغيير محسوس في تجربة المستخدم.
//
// النتيجة المتوقعة: صورة 4-10 ميجا بترجع لحوالي 150-400 كيلوبايت، مع
// بقاء النص/التفاصيل مقروءة تمامًا.

const DEFAULT_MAX_DIMENSION = 1600; // بكسل لأطول ضلع — كفاية لقراءة نص البطاقة بوضوح
const DEFAULT_QUALITY = 0.75; // جودة JPEG (0-1)

/** بيضغط ملف صورة عبر Canvas: تصغير الأبعاد لحد أقصى + إعادة ترميز JPEG
 *  بجودة أقل. بيرجع الملف الأصلي زي ما هو (من غير رفض الرفع) في أي حالة
 *  فشل أو لو الناتج المضغوط طلع أكبر من الأصل (ملفات صغيرة أصلاً مثلاً).
 *  @param file الملف الأصلي (لازم يكون صورة — image/*)
 */
export async function compressImageFile(
    file: File,
    maxDimension: number = DEFAULT_MAX_DIMENSION,
    quality: number = DEFAULT_QUALITY
): Promise<File> {
    // مش صورة (احتياطي — input الحالي أصلاً accept="image/*") → من غير تعديل
    if (!file.type.startsWith('image/')) return file;

    try {
        const objectUrl = URL.createObjectURL(file);
        const img = await loadImage(objectUrl);
        URL.revokeObjectURL(objectUrl);

        const { width, height } = fitDimensions(img.naturalWidth, img.naturalHeight, maxDimension);

        // الصورة أصلاً أصغر من الحد الأقصى ومفيش داعي لتكبيرها أو
        // لإعادة ترميزها من غير فايدة حقيقية.
        if (width >= img.naturalWidth && height >= img.naturalHeight && file.size < 500 * 1024) {
            return file;
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) return file;
        ctx.drawImage(img, 0, 0, width, height);

        const blob = await new Promise<Blob | null>((resolve) => {
            canvas.toBlob((b) => resolve(b), 'image/jpeg', quality);
        });
        if (!blob) return file;

        // لو الضغط لأي سبب طلع أكبر من الأصل (نادر — صور مضغوطة جدًا
        // أصلاً)، نفضّل الملف الأصلي.
        if (blob.size >= file.size) return file;

        const newName = file.name.replace(/\.[^.]+$/, '') + '.jpg';
        return new File([blob], newName, { type: 'image/jpeg', lastModified: Date.now() });
    } catch {
        // أي فشل في التحميل/الرسم/الترميز → نرفع الملف الأصلي زي ما هو
        // بدل ما نمنع المستخدم من الرفع خالص.
        return file;
    }
}

function loadImage(src: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = src;
    });
}

function fitDimensions(width: number, height: number, maxDimension: number): { width: number; height: number } {
    if (width <= maxDimension && height <= maxDimension) return { width, height };
    const scale = width > height ? maxDimension / width : maxDimension / height;
    return { width: Math.round(width * scale), height: Math.round(height * scale) };
}
