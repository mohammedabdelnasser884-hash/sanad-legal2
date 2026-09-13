import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import { installGlobalErrorWatcher } from './systemHealth';
import ErrorBoundary from './ErrorBoundary';
// ⚠️ الاستيرادات دي كلها side-effect فقط (بتسجّل دوال على window وبتضيف
// event listeners)، مفيش exports مستخدمة هنا.
import './lib/offlineQueue';
import './lib/serviceWorkerBootstrap';
import './lib/heartbeat';

// شبكة أمان: تمسك أي خطأ غير متوقع (JS error أو Promise مرفوض بلا catch)
// من أي مكان في التطبيق وتسجّله كتنبيه في الصفحة الرئيسية
installGlobalErrorWatcher();

// ══════════════════════════════════════════════════════════
//  Mount — بعد تعريف كل الـ globals (offlineQueue/serviceWorkerBootstrap)
//  عشان Service Worker يلاقيها جاهزة لو طلب sync قبل أو أثناء أول render
// ══════════════════════════════════════════════════════════
const root = ReactDOM.createRoot(document.getElementById('root')!);
root.render(
    <ErrorBoundary>
        <App />
    </ErrorBoundary>
);
