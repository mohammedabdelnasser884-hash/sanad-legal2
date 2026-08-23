#!/usr/bin/env bash
# reorganize-docs.sh
# ينقل كل ملفات .md من جذر الريبو إلى docs/ مقسّمة حسب النوع،
# باستخدام git mv عشان يحافظ على تاريخ كل ملف (بدل mv عادي).
#
# التشغيل: من جذر الريبو مباشرة
#   chmod +x reorganize-docs.sh
#   ./reorganize-docs.sh
#
# بعد التشغيل: راجع النتيجة بـ `git status`، وبعدين
#   git add -A
#   git commit -m "docs: تنظيم ملفات MD من الـroot إلى docs/"

set -euo pipefail

if [ ! -d .git ]; then
  echo "❌ لازم تشغّل السكريبت من جذر الريبو (فين .git)."
  exit 1
fi

mkdir -p docs/reports/phases docs/reports/features docs/plans docs/audits

moved=0
for f in *.md; do
  # لو مفيش ملفات .md في الـroot أصلاً، الـglob هيفضل زي ما هو
  [ -e "$f" ] || continue

  lower=$(echo "$f" | tr '[:upper:]' '[:lower:]')

  if [[ "$lower" == *phase* || "$f" == *"المرحلة"* ]]; then
    dest="docs/reports/phases"
  elif [[ "$f" == *"تدقيق"* || "$f" == *"مراجعة"* || "$lower" == *audit* || "$lower" == *verification* || "$lower" == *reliability* ]]; then
    dest="docs/audits"
  elif [[ "$f" == *"خطة"* || "$lower" == *plan* ]]; then
    dest="docs/plans"
  else
    dest="docs/reports/features"
  fi

  echo "→ $f  ==>  $dest/"
  git mv "$f" "$dest/"
  moved=$((moved + 1))
done

echo ""
echo "✅ اتنقل $moved ملف."
echo "راجع بـ: git status"
echo "بعدين:   git add -A && git commit -m 'docs: تنظيم ملفات MD من الـroot إلى docs/'"
