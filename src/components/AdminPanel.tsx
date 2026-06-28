import React, { useState, useEffect, useCallback, useRef } from 'react';
import { I } from '../constants';
import { toast, validateUploadFile, detectDevice } from '../utils';
import { callAdminAction } from '../supabaseClient';
import LegalLibraryModal from './LegalLibraryModal';

// ─── Sub-components ──────────────────────
import { IconAdmin, IconToggle, IconKey, IconPortal, IconActivity, IconSecurity, IconLockSm, IconDevices, IconWarning, IconBackup, IconSessions, IconOffice, ROLE_CONFIG, PERMISSION_LABELS } from './admin/icons';
import EditUserModal from './admin/modals/EditUserModal';
import AddUserModal from './admin/modals/AddUserModal';
import ChangePasswordModal from './admin/modals/ChangePasswordModal';
import AddPortalUserModal from './admin/modals/AddPortalUserModal';
import ClientPortalModal from './admin/modals/ClientPortalModal';

// ─── Hooks ───────────────────────────────
import { useAdminUsers } from '../hooks/admin/useAdminUsers';
import { useAdminSessions } from '../hooks/admin/useAdminSessions';
import { useAdminActivity } from '../hooks/admin/useAdminActivity';
import { useAdminBackup } from '../hooks/admin/useAdminBackup';
import { useAdminOffice } from '../hooks/admin/useAdminOffice';
import { useAdminLegalLibrary } from '../hooks/admin/useAdminLegalLibrary';
import { useAdminPortal } from '../hooks/admin/useAdminPortal';
// ─── Types ────────────────────────────────
interface AdminPanelProps {
    profile: {
        id: string;
        user_id: string;
        full_name: string;
        email: string;
        role: 'admin' | 'lawyer' | 'viewer';
        tenant_id: string;
        [key: string]: any;
    } | null;
    lawyers: any[];
    clients: any[];
    fetchLawyers: () => void;
}

export default function AdminPanel({ profile, lawyers, clients, fetchLawyers }: AdminPanelProps) {
  const [section, setSection] = useState(null);

  // ── قفل الـ scroll ──
  useEffect(() => {
    const main = document.querySelector('main');
    if (!main) return;
    if (section) { main.style.overflow = 'hidden'; }
    else { main.style.overflow = ''; }
    return () => { main.style.overflow = ''; };
  }, [section]);

  // ─── Hooks ──────────────────────────────
  const users = useAdminUsers(fetchLawyers, profile);
  const sessions = useAdminSessions(section, profile);
  const activity = useAdminActivity();
  const backup = useAdminBackup(profile);
  const office = useAdminOffice(profile?.tenant_id ?? null, profile);
  const library = useAdminLegalLibrary(profile);
  const portal = useAdminPortal(profile);

  // ── destructure للـ render compatibility (نفس أسماء المتغيرات القديمة) ──
  const { editUser, setEditUser, showAddUser, setShowAddUser, saving, confirmDelete, setConfirmDelete, changePassUser, setChangePassUser, confirmSignOut, setConfirmSignOut, confirmLock, setConfirmLock, securityMsg, setSecurityMsg, handleEditUser, handleAddUser, handleDeleteUser, toggleUserActive, handleChangePassword, handleSignOutAllDevices, handleToggleLock } = users;
  const { activeSessions, loadingSessions, terminatingSession, terminatingAll, setTerminatingAll, confirmTerminateAll, setConfirmTerminateAll, sessionsLastRefresh, sessionsAutoRefresh, setSessionsAutoRefresh, fetchActiveSessions, handleTerminateSession, handleTerminateAllSessions } = sessions;
  const { activityLog, activityTotal, loadingActivity, activityPage, setActivityPage, activityFilters, setActivityFilters, ACTIVITY_PAGE_SIZE, fetchActivity } = activity;

  // ── Debounce على بحث النشاط (400ms) — يمنع query لكل حرف ──
  const [activitySearchInput, setActivitySearchInput] = useState(activityFilters.search || '');
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout>|null>(null);
  const handleActivitySearchChange = useCallback((val: string) => {
    setActivitySearchInput(val);
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => {
      setActivityFilters((f: any) => ({ ...f, search: val }));
      setActivityPage(0);
    }, 400);
  }, [setActivityFilters, setActivityPage]);
  const { backups, loadingBackups, creatingBackup, backupProgress, confirmRestore, setConfirmRestore, restoreConfirmText, setRestoreConfirmText, restoringBackup, fetchBackups, handleCreateBackup, handleDownloadBackup, handleRestoreBackup } = backup;
  const { officeSettings, setOfficeSettings, loadingOffice, savingOffice, logoFile, setLogoFile, logoPreview, setLogoPreview, fetchOfficeSettings, handleSaveOfficeSettings } = office;
  const { laws, legalCategories, loadingLaws, showLawModal, setShowLawModal, editingLaw, setEditingLaw, confirmDeleteLaw, setConfirmDeleteLaw, savingLaw, processingLaw, fetchLaws, fetchLegalCategories, handleSaveLaw, handleProcessLaw, handleDeleteLaw } = library;
  const { portalAccess, portalClient, setPortalClient, clientSearch, setClientSearch, showAddPortalUser, setShowAddPortalUser, savingPortal, fetchPortalAccess, handleSavePortal } = portal;

  // ── جلب البيانات عند تغيير القسم ──
  useEffect(() => {
    fetchPortalAccess();
    // ملاحظة: قسم activity يُعاد جلبه من useEffect منفصل (يراقب الفلاتر والصفحة)
    // عشان نتجنب double-fetch لما المستخدم يفتح القسم لأول مرة
    if (section === 'backup')   fetchBackups();
    if (section === 'office')   fetchOfficeSettings();
    if (section === 'legal_library') { fetchLaws(); fetchLegalCategories(); }
  }, [section]);

  // ── جلب سجل النشاط عند فتح القسم أو تغيير الفلاتر أو الصفحة ──
  // useEffect واحد بس عشان ما يتنادى مرتين عند فتح القسم لأول مرة
  useEffect(() => {
    if (section === 'activity') fetchActivity(activityFilters, activityPage);
  }, [section, activityFilters, activityPage]);

  // ── إحصائيات المستخدمين ──
  const stats = {
    total:         lawyers.length,
    active:        lawyers.filter((u: any) => u.is_active !== false).length,
    admins:        lawyers.filter((u: any) => u.role === 'admin').length,
    portalEnabled: portalAccess.filter((p: any) => p.is_active !== false).length,
  };

  // ── قائمة الموكلين المفلترة لبوابة الموكل ──
  const filteredClients = clients.filter((c: any) =>
    !clientSearch.trim() || (c.full_name || c.client_name || '').includes(clientSearch.trim())
  );

  return React.createElement(React.Fragment, null,

    // ── المحتوى الرئيسي — متخفي لما section مفتوح ──
    React.createElement('div',{
      className:"space-y-4 fade-in px-4 py-4 pb-32",
      style: section ? {display:'none'} : {}
    },

    // ── هيدر ──
    React.createElement('div',{className:"flex items-center justify-between"},
      React.createElement('div',{className:"flex items-center gap-2"},
        React.createElement('div',{className:"w-9 h-9 rounded-xl bg-gradient-to-tr from-[#8B6914] to-[#C9A84C] flex items-center justify-center shadow-lg"},
          React.createElement(IconAdmin)
        ),
        React.createElement('div',null,
          React.createElement('h2',{className:"text-sm font-black text-white"},"لوحة الإدارة"),
          React.createElement('p',{className:"text-[10px] text-slate-500"},"Admin Panel")
        )
      ),
      section === 'users' && React.createElement('button',{
        onClick:()=>setShowAddUser(true),
        className:"flex items-center gap-1 bg-gradient-to-tr from-[#C9A84C] to-[#C9A84C]/80 text-white px-3 py-2 rounded-xl text-xs font-black shadow-lg active:scale-95 transition-transform"
      }, React.createElement(I.Plus), "مستخدم جديد")
    ),

    // ── Nav Cards (الترتيب الجديد) ──
    React.createElement('div',{className:"grid grid-cols-2 gap-2.5"},

      // صف 1: المستخدمون + بوابة الموكل
      ...[
        {
          id:'users',
          icon: React.createElement(I.Users),
          label:'المستخدمون',
          desc:'إدارة الصلاحيات',
          badge: String(stats.total),
          accentBefore:'#60a5fa',
          iconBg:'rgba(96,165,250,0.12)', iconColor:'#60a5fa',
          activeBg:'rgba(96,165,250,0.04)', activeBorder:'rgba(96,165,250,0.22)',
          hoverBorder:'rgba(96,165,250,0.25)',
        },
        {
          id:'portal',
          icon: React.createElement(IconPortal),
          label:'بوابة الموكل',
          desc:'أرقام دخول الموكلين',
          badge: String(stats.portalEnabled),
          accentBefore:'#a78bfa',
          iconBg:'rgba(167,139,250,0.12)', iconColor:'#a78bfa',
          activeBg:'', activeBorder:'',
          hoverBorder:'rgba(167,139,250,0.25)',
        },
        // صف 2: سجل النشاط + الجلسات
        {
          id:'activity',
          icon: React.createElement(IconActivity),
          label:'سجل النشاط',
          desc:'كل ما حدث',
          badge: null,
          accentBefore:'#60a5fa',
          iconBg:'rgba(96,165,250,0.12)', iconColor:'#60a5fa',
          activeBg:'', activeBorder:'',
          hoverBorder:'rgba(96,165,250,0.25)',
        },
        {
          id:'sessions',
          icon: React.createElement(IconSessions),
          label:'الجلسات',
          desc:'نشط خلال آخر 24 ساعة',
          badge: null,
          accentBefore:'#4ade80',
          iconBg:'rgba(74,222,128,0.12)', iconColor:'#4ade80',
          activeBg:'', activeBorder:'',
          hoverBorder:'rgba(74,222,128,0.25)',
        },
        // صف 3: الأمان + نسخ احتياطي
        {
          id:'security',
          icon: React.createElement(IconSecurity),
          label:'الأمان',
          desc:'كلمات المرور',
          badge: null,
          accentBefore:'#fb7185',
          iconBg:'rgba(251,113,133,0.12)', iconColor:'#fb7185',
          activeBg:'', activeBorder:'',
          hoverBorder:'rgba(251,113,133,0.25)',
        },
        {
          id:'backup',
          icon: React.createElement(IconBackup),
          label:'نسخ احتياطي',
          desc:'CSV و JSON',
          badge: null,
          accentBefore:'#22d3ee',
          iconBg:'rgba(34,211,238,0.12)', iconColor:'#22d3ee',
          activeBg:'', activeBorder:'',
          hoverBorder:'rgba(34,211,238,0.25)',
        },
      ].map(t =>
        React.createElement('button',{
          key: t.id,
          onClick: () => setSection(t.id),
          className:'active:scale-[0.97] transition-all text-right',
          style:{
            background: section===t.id ? (t.activeBg||'rgba(96,165,250,0.04)') : 'rgba(255,255,255,0.02)',
            border: `1px solid ${section===t.id ? (t.activeBorder||t.accentBefore+'55') : 'rgba(255,255,255,0.04)'}`,
            borderRadius: '16px',
            padding: '14px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            height: '100px',
            position: 'relative',
            overflow: 'hidden',
            cursor: 'pointer',
          }
        },
          // خط علوي ملون
          React.createElement('div',{style:{
            position:'absolute', top:0, right:'12px', left:'12px',
            height:'2px', borderRadius:'0 0 4px 4px',
            background: t.accentBefore, opacity: section===t.id ? 1 : 0.5,
          }}),
          // أيقونة + badge
          React.createElement('div',{className:'flex items-start justify-between'},
            React.createElement('div',{style:{
              width:'30px', height:'30px', borderRadius:'10px',
              display:'flex', alignItems:'center', justifyContent:'center',
              background: t.iconBg, color: t.iconColor,
            }},
              React.createElement('div',{className:'w-4 h-4'}, t.icon)
            ),
            t.badge !== null && React.createElement('span',{
              className:'text-[11px] font-black px-2 py-0.5 rounded-lg',
              style:{background: t.iconBg, color: t.iconColor}
            }, t.badge)
          ),
          // نص
          React.createElement('div',null,
            React.createElement('p',{className:'text-xs font-black text-white leading-tight'}, t.label),
            React.createElement('p',{className:'text-[9.5px] text-slate-500 mt-0.5 font-medium'}, t.desc)
          ),
          // نقطة التحديد
          section===t.id && React.createElement('div',{style:{
            position:'absolute', bottom:'10px', left:'12px',
            width:'5px', height:'5px', borderRadius:'50%',
            background: t.accentBefore,
            boxShadow:`0 0 8px ${t.accentBefore}cc`,
          }})
        )
      ),

      // صف 4: إعدادات المكتب — عريض
      React.createElement('button',{
        key:'office',
        onClick:()=>setSection('office'),
        className:'active:scale-[0.97] transition-all text-right',
        style:{
          gridColumn:'span 2',
          background: section==='office' ? 'rgba(245,158,11,0.06)' : 'rgba(255,255,255,0.02)',
          border:`1px solid ${section==='office' ? 'rgba(245,158,11,0.3)' : 'rgba(255,255,255,0.04)'}`,
          borderRadius:'16px', padding:'14px',
          display:'flex', flexDirection:'row', alignItems:'center', gap:'14px',
          height:'78px', position:'relative', overflow:'hidden', cursor:'pointer',
        }
      },
        React.createElement('div',{style:{
          position:'absolute', top:0, right:0, left:0,
          height:'2px', background:'#f59e0b', opacity: section==='office' ? 1 : 0.5,
        }}),
        React.createElement('div',{style:{
          width:'34px', height:'34px', borderRadius:'12px', flexShrink:0,
          display:'flex', alignItems:'center', justifyContent:'center',
          background:'rgba(245,158,11,0.12)', color:'#f59e0b',
        }},
          React.createElement('div',{className:'w-5 h-5'}, React.createElement(IconOffice))
        ),
        React.createElement('div',{style:{flex:1}},
          React.createElement('p',{className:'text-xs font-black text-white leading-tight'},'إعدادات المكتب'),
          React.createElement('p',{className:'text-[9.5px] text-slate-500 mt-0.5 font-medium'},'الهوية والفاتورة للمؤسسة القانونية')
        ),
        section==='office' && React.createElement('div',{style:{
          position:'absolute', bottom:'10px', left:'12px',
          width:'5px', height:'5px', borderRadius:'50%',
          background:'#f59e0b', boxShadow:'0 0 8px rgba(245,158,11,0.8)',
        }})
      ),

      // صف 5: المكتبة القانونية — عريض
      React.createElement('button',{
        key:'legal_library',
        onClick:()=>setSection('legal_library'),
        className:'active:scale-[0.97] transition-all text-right',
        style:{
          gridColumn:'span 2',
          background: section==='legal_library' ? 'rgba(45,212,191,0.06)' : 'rgba(255,255,255,0.02)',
          border:`1px solid ${section==='legal_library' ? 'rgba(45,212,191,0.3)' : 'rgba(255,255,255,0.04)'}`,
          borderRadius:'16px', padding:'14px',
          display:'flex', flexDirection:'row', alignItems:'center', gap:'14px',
          height:'78px', position:'relative', overflow:'hidden', cursor:'pointer',
        }
      },
        React.createElement('div',{style:{
          position:'absolute', top:0, right:0, left:0,
          height:'2px', background:'#2dd4bf', opacity: section==='legal_library' ? 1 : 0.5,
        }}),
        React.createElement('div',{style:{
          width:'34px', height:'34px', borderRadius:'12px', flexShrink:0,
          display:'flex', alignItems:'center', justifyContent:'center',
          background:'rgba(45,212,191,0.12)', color:'#2dd4bf',
        }},
          React.createElement('div',{className:'w-5 h-5'}, React.createElement(I.Scale))
        ),
        React.createElement('div',{style:{flex:1}},
          React.createElement('p',{className:'text-xs font-black text-white leading-tight'},'المكتبة القانونية'),
          React.createElement('p',{className:'text-[9.5px] text-slate-500 mt-0.5 font-medium'},'القوانين والمواد التي يعتمد عليها المساعد الذكي')
        ),
        React.createElement('span',{
          className:'text-[11px] font-black px-2 py-0.5 rounded-lg',
          style:{background:'rgba(45,212,191,0.12)', color:'#2dd4bf'}
        }, String(laws.length)),
        section==='legal_library' && React.createElement('div',{style:{
          position:'absolute', bottom:'10px', left:'12px',
          width:'5px', height:'5px', borderRadius:'50%',
          background:'#2dd4bf', boxShadow:'0 0 8px rgba(45,212,191,0.8)',
        }})
      )
    ),

    // ── بوابة إدارة المكاتب المشتركة ──
    React.createElement('button',{
      onClick:()=> window.open('/offices-portal.html', '_blank'),
      className:'active:scale-[0.97] transition-all text-right w-full',
      style:{
        gridColumn:'span 2',
        background:'linear-gradient(135deg, rgba(139,105,20,0.12) 0%, rgba(201,168,76,0.08) 100%)',
        border:'1px solid rgba(201,168,76,0.3)',
        borderRadius:'16px', padding:'14px',
        display:'flex', flexDirection:'row', alignItems:'center', gap:'14px',
        height:'78px', position:'relative', overflow:'hidden', cursor:'pointer',
      }
    },
      React.createElement('div',{style:{
        position:'absolute', top:0, right:0, left:0,
        height:'2px', background:'linear-gradient(90deg,#8B6914,#C9A84C)', opacity:0.8,
      }}),
      React.createElement('div',{style:{
        width:'34px', height:'34px', borderRadius:'12px', flexShrink:0,
        display:'flex', alignItems:'center', justifyContent:'center',
        background:'rgba(201,168,76,0.15)', color:'#C9A84C',
      }},
        React.createElement('svg',{className:'w-5 h-5',fill:'none',viewBox:'0 0 24 24',stroke:'currentColor',strokeWidth:'1.5'},
          React.createElement('path',{strokeLinecap:'round',strokeLinejoin:'round',d:'M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21'})
        )
      ),
      React.createElement('div',{style:{flex:1}},
        React.createElement('p',{className:'text-xs font-black text-white leading-tight'},'بوابة إدارة المكاتب'),
        React.createElement('p',{className:'text-[9.5px] mt-0.5 font-medium',style:{color:'#C9A84C'}},'إدارة المكاتب المشتركة في المنظومة ↗')
      ),
      React.createElement('div',{style:{
        width:'20px', height:'20px', borderRadius:'8px', flexShrink:0,
        display:'flex', alignItems:'center', justifyContent:'center',
        background:'rgba(201,168,76,0.15)', color:'#C9A84C',
      }},
        React.createElement('svg',{className:'w-3 h-3',fill:'none',viewBox:'0 0 24 24',stroke:'currentColor',strokeWidth:'2.5'},
          React.createElement('path',{strokeLinecap:'round',strokeLinejoin:'round',d:'M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25'})
        )
      )
    ),

    // ── إحصائيات سريعة ──
    React.createElement('div',{className:'space-y-2'},
      React.createElement('p',{className:'text-[9px] font-black text-slate-600 tracking-widest px-1'},'إحصائيات سريعة'),
      React.createElement('div',{className:'grid grid-cols-4 gap-2'},
        [
          { label:'الإجمالي', value:stats.total,         icon:'👥', bg:'rgba(255,255,255,0.03)', border:'rgba(255,255,255,0.06)', numColor:'#e2e8f0', glowColor:'rgba(255,255,255,0.2)' },
          { label:'نشط',      value:stats.active,        icon:'⚡', bg:'rgba(74,222,128,0.06)',  border:'rgba(74,222,128,0.15)',  numColor:'#4ade80', glowColor:'rgba(74,222,128,0.6)' },
          { label:'مديرون',   value:stats.admins,        icon:'🛡', bg:'rgba(96,165,250,0.06)',  border:'rgba(96,165,250,0.15)',  numColor:'#60a5fa', glowColor:'rgba(96,165,250,0.6)' },
          { label:'بوابات',   value:stats.portalEnabled, icon:'🔑', bg:'rgba(245,158,11,0.06)',  border:'rgba(245,158,11,0.15)',  numColor:'#fbbf24', glowColor:'rgba(245,158,11,0.6)' },
        ].map(s => React.createElement('div',{
          key:s.label,
          style:{
            background:s.bg, border:`1px solid ${s.border}`,
            borderRadius:'13px', padding:'10px 6px 9px',
            textAlign:'center', position:'relative', overflow:'hidden',
          }
        },
          // خط علوي متوهج
          React.createElement('div',{style:{
            position:'absolute', top:0, left:'20%', right:'20%',
            height:'1.5px', borderRadius:'0 0 3px 3px',
            background:s.numColor, boxShadow:`0 0 6px ${s.glowColor}`,
          }}),
          React.createElement('div',{style:{fontSize:'13px', marginBottom:'4px', lineHeight:1}}, s.icon),
          React.createElement('p',{style:{fontSize:'19px', fontWeight:800, color:s.numColor, lineHeight:1, marginBottom:'3px'}}, s.value),
          React.createElement('p',{style:{fontSize:'8.5px', color:'#475569', fontWeight:700}}, s.label)
        ))
      )
    ),
  ), // ── نهاية div المحتوى الرئيسي ──

    // ══════════════════════════════════════
    //  FULL-SCREEN OVERLAY
    // ══════════════════════════════════════
    section && React.createElement('div',{
      className:"fixed inset-x-0 bottom-0 z-[60] flex flex-col bg-premium-bg slide-up-full",style:{top:"52px"}
    },

      // ── هيدر القسم مع لون مميز لكل قسم ──
      React.createElement('div',{
        className:"shrink-0 px-4 pb-3 backdrop-blur-lg flex flex-col",
        style:{
          paddingTop:'6px',
          background:'rgba(13,21,39,0.97)',
          borderBottom:'1px solid rgba(255,255,255,0.05)',
        }
      },
        // الشريط الملون العلوي لكل قسم
        React.createElement('div',{style:{
          position:'absolute', top:0, right:0, left:0, height:'3px',
          background:({
            users:   'linear-gradient(90deg,#3b82f6,#60a5fa)',
            portal:  'linear-gradient(90deg,#7c3aed,#a78bfa)',
            activity:'linear-gradient(90deg,#2563eb,#60a5fa)',
            sessions:'linear-gradient(90deg,#16a34a,#4ade80)',
            security:'linear-gradient(90deg,#e11d48,#fb7185)',
            backup:  'linear-gradient(90deg,#0891b2,#22d3ee)',
            office:  'linear-gradient(90deg,#d97706,#fbbf24)',
            legal_library: 'linear-gradient(90deg,#0d9488,#2dd4bf)',
          })[section]||'transparent',
          boxShadow:({
            users:   '0 0 12px rgba(96,165,250,0.5)',
            portal:  '0 0 12px rgba(167,139,250,0.5)',
            activity:'0 0 12px rgba(96,165,250,0.5)',
            sessions:'0 0 12px rgba(74,222,128,0.5)',
            security:'0 0 12px rgba(251,113,133,0.5)',
            backup:  '0 0 12px rgba(34,211,238,0.5)',
            office:  '0 0 12px rgba(251,191,36,0.5)',
            legal_library: '0 0 12px rgba(45,212,191,0.5)',
          })[section]||'none',
        }}),

        // صف الهيدر
        React.createElement('div',{className:"flex items-center justify-between mt-1"},
          React.createElement('div',{className:"flex items-center gap-3"},
            // زرار رجوع بسهم
            React.createElement('button',{
              onClick:()=>setSection(null),
              className:"w-9 h-9 rounded-xl bg-white/5 border border-white/8 flex items-center justify-center text-slate-400 active:scale-90 transition-transform"
            },
              React.createElement('svg',{className:"w-4 h-4",fill:"none",viewBox:"0 0 24 24",strokeWidth:"2.5",stroke:"currentColor"},
                React.createElement('path',{strokeLinecap:"round",strokeLinejoin:"round",d:"M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3"})
              )
            ),
            React.createElement('div',null,
              React.createElement('h2',{className:"text-sm font-black text-white"},
                ({users:'المستخدمون',sessions:'الجلسات',portal:'بوابة الموكل',activity:'سجل النشاط',security:'الأمان',backup:'نسخ احتياطي',office:'إعدادات المكتب',legal_library:'المكتبة القانونية'})[section]||''
              ),
              React.createElement('p',{className:"text-[10px] text-slate-500"},"لوحة الإدارة")
            )
          ),
          section === 'users' && React.createElement('button',{
            onClick:()=>setShowAddUser(true),
            className:"flex items-center gap-1 bg-gradient-to-tr from-[#C9A84C] to-[#C9A84C]/80 text-white px-3 py-2 rounded-xl text-xs font-black active:scale-95 transition-transform"
          }, React.createElement(I.Plus), "مستخدم جديد"),
          section === 'portal' && React.createElement('button',{
            onClick:()=>setShowAddPortalUser(true),
            className:"flex items-center gap-1 bg-gradient-to-tr from-[#C9A84C] to-[#E8C97A] text-white px-3 py-2 rounded-xl text-xs font-black active:scale-95 transition-transform"
          }, React.createElement(I.Plus), "وصول جديد"),
          section === 'legal_library' && React.createElement('button',{
            onClick:()=>{ setEditingLaw(null); setShowLawModal(true); },
            className:"flex items-center gap-1 bg-gradient-to-tr from-teal-500 to-teal-400 text-white px-3 py-2 rounded-xl text-xs font-black active:scale-95 transition-transform"
          }, React.createElement(I.Plus), "قانون جديد")
        )
      ),
      React.createElement('div',{className:"flex-1 overflow-y-auto no-scrollbar px-4 py-4 pb-10 space-y-3"},

    section === 'users' && React.createElement('div',{className:"space-y-3"},
      lawyers.length === 0
        ? React.createElement('div',{className:"bg-premium-card border border-white/5 rounded-xl p-10 text-center text-slate-500 text-xs"},"لا يوجد مستخدمون")
        : lawyers.map(user => {
            const rc = ROLE_CONFIG[user.role] || ROLE_CONFIG.viewer;
            const isInactive = user.is_active === false;
            return React.createElement('div',{
              key:user.id,
              className:`bg-premium-card border rounded-2xl p-4 transition-all ${isInactive?'border-red-500/20 opacity-60':'border-white/5'}`
            },
              // صف العلوي
              React.createElement('div',{className:"flex items-start gap-3"},
                // أفاتار
                React.createElement('div',{
                  className:`w-10 h-10 rounded-xl flex items-center justify-center font-black text-sm flex-shrink-0 ${rc.bg} ${rc.color}`
                }, (user.full_name||'م').charAt(0)),

                // معلومات
                React.createElement('div',{className:"flex-1 min-w-0"},
                  React.createElement('div',{className:"flex items-center gap-2"},
                    React.createElement('p',{className:"text-xs font-black text-white truncate"},user.full_name||'—'),
                    isInactive && React.createElement('span',{className:"text-[8px] bg-red-500/20 text-red-400 px-1.5 py-0.5 rounded-full font-bold"},"معطّل")
                  ),
                  React.createElement('p',{className:"text-[10px] text-slate-500 truncate"},user.email||''),
                  React.createElement('div',{className:"flex items-center gap-2 mt-1"},
                    React.createElement('span',{className:`text-[9px] font-bold px-2 py-0.5 rounded-full border ${rc.bg} ${rc.color} ${rc.border}`},rc.label),
                    user.permissions && Object.keys(user.permissions).length > 0 &&
                      React.createElement('span',{className:"text-[9px] text-slate-600"},
                        Object.values(user.permissions).filter(Boolean).length + " صلاحية")
                  )
                ),

                // أزرار
                React.createElement('div',{className:"flex gap-1.5"},
                  React.createElement('button',{
                    onClick:()=>toggleUserActive(user),
                    className:`w-8 h-8 rounded-xl flex items-center justify-center border transition-all active:scale-90 ${isInactive?'bg-[#C9A84C]/15 border-[#C9A84C]/30 text-[#C9A84C]':'bg-red-500/10 border-red-500/20 text-red-400'}`
                  }, React.createElement(IconToggle,{on:!isInactive})),

                  React.createElement('button',{
                    onClick:()=>setChangePassUser(user),
                    title:"تغيير كلمة المرور",
                    className:"w-8 h-8 rounded-xl flex items-center justify-center bg-[#C9A84C]/15 border border-[#C9A84C]/30 text-[#C9A84C] active:scale-90 transition-all"
                  }, React.createElement(IconKey)),

                  React.createElement('button',{
                    onClick:()=>setEditUser(user),
                    className:"w-8 h-8 rounded-xl flex items-center justify-center bg-[#C9A84C]/15 border border-[#C9A84C]/30 text-[#C9A84C] active:scale-90 transition-all"
                  }, React.createElement(I.Edit)),

                  user.id !== profile?.id && React.createElement('button',{
                    onClick:()=>setConfirmDelete(user),
                    className:"w-8 h-8 rounded-xl flex items-center justify-center bg-red-500/10 border border-red-500/20 text-red-400 active:scale-90 transition-all"
                  }, React.createElement(I.Trash))
                )
              ),

              // الصلاحيات المفعّلة
              user.role !== 'admin' && user.permissions && Object.keys(user.permissions).some(k=>user.permissions[k]) &&
                React.createElement('div',{className:"mt-3 flex flex-wrap gap-1"},
                  Object.entries(PERMISSION_LABELS)
                    .filter(([k])=>user.permissions[k])
                    .map(([k,{label,icon}])=>React.createElement('span',{
                      key:k,
                      className:"text-[8px] bg-[#C9A84C]/10 text-[#C9A84C] border border-[#C9A84C]/20 px-1.5 py-0.5 rounded-full"
                    },icon+" "+label))
                )
            );
          })
    ),

    // ══════════════════════════
    //  SECTION: إدارة الجلسات
    // ══════════════════════════
    section === 'sessions' && React.createElement('div',{className:"space-y-3"},

      // ── هيدر إحصائي ──
      React.createElement('div',{
        className:"rounded-2xl p-4 space-y-3",
        style:{background:'linear-gradient(135deg,rgba(16,185,129,0.10),rgba(16,185,129,0.03))',border:'1px solid rgba(16,185,129,0.20)'}
      },
        React.createElement('div',{className:"flex items-center justify-between"},
          React.createElement('div',{className:"flex items-center gap-3"},
            React.createElement('div',{className:"w-10 h-10 rounded-xl bg-[#C9A84C]/20 flex items-center justify-center"},
              React.createElement(IconSessions,{className:"w-5 h-5 text-[#C9A84C]"})
            ),
            React.createElement('div',null,
              React.createElement('p',{className:"text-sm font-black text-white"},"الجلسات النشطة — آخر 24 ساعة"),
              React.createElement('p',{className:"text-[10px] text-[#C9A84C]"},"مراقبة حقيقية لكل من يستخدم المنظومة الآن")
            )
          ),
          // زر refresh
          React.createElement('button',{
            onClick: fetchActiveSessions,
            disabled: loadingSessions,
            className:"w-9 h-9 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center active:scale-90 transition-transform"
          }, loadingSessions ? React.createElement(I.Spin) : React.createElement('svg',{className:"w-4 h-4 text-[#C9A84C]",fill:"none",viewBox:"0 0 24 24",strokeWidth:"2",stroke:"currentColor"},
            React.createElement('path',{strokeLinecap:"round",strokeLinejoin:"round",d:"M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99"})
          ))
        ),

        // إحصاءات سريعة
        React.createElement('div',{className:"grid grid-cols-3 gap-2"},
          (() => {
            const online = activeSessions.filter(s=>s.isOnline).length;
            const total  = activeSessions.length;
            const suspicious = activeSessions.filter(s => {
              // نعتبره مشبوهاً لو دخل من IP مختلف أو في وقت غير عادي
              const h = new Date(s.lastSeenAt).getHours();
              return h >= 0 && h < 5; // دخول بعد منتصف الليل تحذير
            }).length;
            return [
              { label:'متصل الآن', value: online, color:'text-[#C9A84C]', bg:'bg-[#C9A84C]/10', dot:'bg-[#C9A84C]' },
              { label:'إجمالي الجلسات', value: total, color:'text-white', bg:'bg-white/5', dot:null },
              { label:'تحذيرات', value: suspicious, color: suspicious>0?'text-[#C9A84C]':'text-slate-500', bg: suspicious>0?'bg-[#C9A84C]/10':'bg-white/5', dot: suspicious>0?'bg-red-500':null },
            ].map(item => React.createElement('div',{key:item.label, className:`${item.bg} rounded-xl p-2.5 text-center border border-white/5`},
              React.createElement('div',{className:"flex items-center justify-center gap-1"},
                item.dot && React.createElement('span',{className:`w-1.5 h-1.5 rounded-full ${item.dot} ${item.label==='متصل الآن'?'animate-pulse':''}`}),
                React.createElement('p',{className:`text-base font-black ${item.color}`},item.value)
              ),
              React.createElement('p',{className:"text-[8px] text-slate-500 mt-0.5"},item.label)
            ));
          })()
        ),

        // شريط الـ auto-refresh + آخر تحديث
        React.createElement('div',{className:"flex items-center justify-between"},
          React.createElement('div',{className:"flex items-center gap-2"},
            React.createElement('span',{className:"text-[9px] text-slate-500"},"تحديث تلقائي كل 30 ثانية"),
            React.createElement('button',{
              onClick:()=>setSessionsAutoRefresh(s=>!s),
              className:`w-9 h-5 rounded-full transition-all relative ${sessionsAutoRefresh?'bg-[#C9A84C]':'bg-slate-600'}`
            },
              React.createElement('div',{className:`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all shadow ${sessionsAutoRefresh?'right-0.5':'left-0.5'}`})
            )
          ),
          sessionsLastRefresh && React.createElement('p',{className:"text-[9px] text-slate-600"},
            "آخر تحديث: "+sessionsLastRefresh.toLocaleTimeString('ar-EG',{hour:'2-digit',minute:'2-digit',second:'2-digit'}))
        )
      ),

      // ── زر إنهاء الكل ──
      activeSessions.filter(s=>s.profileId!==profile?.id).length > 0 &&
        React.createElement('button',{
          onClick:()=>setConfirmTerminateAll(true),
          className:"w-full py-2.5 rounded-xl border border-red-500/30 bg-red-500/10 text-[#C9A84C] text-xs font-black flex items-center justify-center gap-2 active:scale-[0.98] transition-all hover:bg-[#C9A84C]/15"
        },
          React.createElement('svg',{className:"w-4 h-4",fill:"none",viewBox:"0 0 24 24",strokeWidth:"2",stroke:"currentColor"},
            React.createElement('path',{strokeLinecap:"round",strokeLinejoin:"round",d:"M5.636 5.636a9 9 0 1 0 12.728 12.728M5.636 5.636a9 9 0 1 1 12.728 12.728M5.636 5.636 12 12m0 0 6.364 6.364"})
          ),
          "إنهاء جميع الجلسات ("+activeSessions.filter(s=>s.profileId!==profile?.id).length+")"
        ),

      // ── حالة التحميل ──
      loadingSessions && activeSessions.length === 0
        ? React.createElement('div',{className:"flex flex-col items-center justify-center py-12 gap-3"},
            React.createElement(I.Spin,{className:"text-[#C9A84C]"}),
            React.createElement('p',{className:"text-xs text-slate-500"},"جاري جلب الجلسات...")
          )

      // ── لا يوجد جلسات ──
      : activeSessions.length === 0 && !loadingSessions
        ? React.createElement('div',{className:"bg-premium-card border border-white/5 rounded-xl p-10 text-center space-y-3"},
            React.createElement('div',{className:"w-12 h-12 rounded-2xl bg-[#C9A84C]/10 flex items-center justify-center mx-auto text-2xl"},"👥"),
            React.createElement('p',{className:"text-sm font-black text-white"},"لا يوجد نشاط مسجّل بعد"),
            React.createElement('p',{className:"text-[10px] text-slate-500 leading-relaxed max-w-xs mx-auto"},
              "لا يوجد مستخدمون نشطون خلال الـ 24 ساعة الماضية.")
          )

      // ── قائمة الجلسات ──
      : React.createElement('div',{className:"space-y-2"},
          activeSessions.map(sess => {
            const rc = ROLE_CONFIG[sess.role] || ROLE_CONFIG.viewer;
            const isMe = sess.profileId === profile?.id;
            const isOnline = sess.isOnline;
            const isTerminating = terminatingSession === sess.id;

            // تصنيف الجهاز
            const deviceIcon = sess.device.includes('📱') ? '📱'
              : sess.device.includes('💻') || sess.device.includes('🖥') ? '💻'
              : sess.device.includes('📲') ? '📲' : '🖥';

            // تنسيق وقت آخر نشاط
            const lastSeenLabel = isOnline
              ? (sess.diffMin === 0 ? 'الآن' : `منذ ${sess.diffMin} دقيقة`)
              : sess.diffMin < 60 ? `منذ ${sess.diffMin} دقيقة`
              : sess.diffMin < 1440 ? `منذ ${Math.floor(sess.diffMin/60)} ساعة`
              : new Date(sess.lastSeenAt).toLocaleDateString('ar-EG',{month:'short',day:'numeric'});

            // تحذير: دخول وقت متأخر
            const loginHour = new Date(sess.lastSeenAt).getHours();
            const isSuspicious = loginHour >= 0 && loginHour < 5;

            return React.createElement('div',{
              key:sess.id,
              className:`rounded-2xl overflow-hidden transition-all ${
                isMe ? 'border-[#C9A84C]/30' :
                isSuspicious ? 'border-red-500/20' :
                isOnline ? 'border-[#C9A84C]/20' : 'border-white/5'
              }`,
              style:{
                background: isMe ? 'linear-gradient(135deg,rgba(16,185,129,0.07),rgba(16,185,129,0.02))'
                  : isSuspicious ? 'linear-gradient(135deg,rgba(239,68,68,0.07),rgba(239,68,68,0.02))'
                  : 'var(--card)',
                border: `1px solid ${
                  isMe ? 'rgba(16,185,129,0.30)' :
                  isSuspicious ? 'rgba(239,68,68,0.25)' :
                  isOnline ? 'rgba(16,185,129,0.20)' : 'rgba(255,255,255,0.05)'
                }`
              }
            },
              // شريط علوي ملون
              React.createElement('div',{
                className:`h-0.5 w-full ${isMe?'bg-[#C9A84C]':isSuspicious?'bg-red-500':isOnline?'bg-[#C9A84C]':'bg-white/10'}`,
                style:{opacity: isOnline||isMe ? 0.8 : 0.3}
              }),

              React.createElement('div',{className:"p-3.5"},
                // صف المعلومات الرئيسية
                React.createElement('div',{className:"flex items-start gap-3"},

                  // أيقونة الجهاز
                  React.createElement('div',{
                    className:`w-11 h-11 rounded-xl flex flex-col items-center justify-center gap-0 flex-shrink-0 relative`,
                    style:{
                      background: isMe ? 'rgba(16,185,129,0.12)' : 'rgba(255,255,255,0.05)',
                      border: `1px solid ${isMe?'rgba(16,185,129,0.25)':'rgba(255,255,255,0.08)'}`
                    }
                  },
                    React.createElement('span',{className:"text-lg leading-none"},deviceIcon),
                    // نقطة الحالة
                    React.createElement('div',{
                      className:`absolute -bottom-1 -left-1 w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center`,
                      style:{
                        background: isOnline ? '#10b981' : '#334155',
                        borderColor: 'var(--bg)',
                      }
                    },
                      isOnline && React.createElement('div',{className:"w-1.5 h-1.5 rounded-full bg-white animate-pulse"})
                    )
                  ),

                  // بيانات الجلسة
                  React.createElement('div',{className:"flex-1 min-w-0"},
                    // اسم + بادجات
                    React.createElement('div',{className:"flex items-center gap-1.5 flex-wrap"},
                      React.createElement('p',{className:"text-xs font-black text-white truncate"},sess.name),
                      isMe && React.createElement('span',{className:"text-[8px] bg-[#C9A84C]/20 text-[#C9A84C] px-1.5 py-0.5 rounded-full font-bold flex-shrink-0"},"أنت"),
                      React.createElement('span',{className:`text-[8px] px-1.5 py-0.5 rounded-full font-bold flex-shrink-0 ${rc.bg} ${rc.color}`},rc.label),
                      isSuspicious && React.createElement('span',{className:"text-[8px] bg-[#C9A84C]/20 text-[#C9A84C] px-1.5 py-0.5 rounded-full font-bold flex-shrink-0 animate-pulse"},"⚠️ وقت مشبوه")
                    ),
                    // بريد
                    React.createElement('p',{className:"text-[9px] text-slate-500 mt-0.5 truncate"},sess.email),
                    // صف الجهاز + الوقت
                    React.createElement('div',{className:"flex items-center gap-2 mt-1 flex-wrap"},
                      React.createElement('span',{className:"text-[9px] text-slate-400 flex items-center gap-1"},
                        React.createElement('span',null,deviceIcon),
                        React.createElement('span',{className:"truncate max-w-[100px]"},
                          sess.device.replace(/[📱💻🖥📲🐧]/g,'').trim() || 'جهاز'
                        )
                      ),
                      React.createElement('span',{className:"w-px h-3 bg-white/10"}),
                      React.createElement('span',{
                        className:`text-[9px] font-bold flex items-center gap-0.5 ${
                          isOnline ? 'text-[#C9A84C]' : 'text-slate-500'
                        }`
                      },
                        isOnline && React.createElement('span',{className:"w-1.5 h-1.5 rounded-full bg-[#C9A84C] animate-pulse flex-shrink-0"}),
                        lastSeenLabel
                      ),
                      sess.ip && sess.ip !== '—' && React.createElement(React.Fragment,null,
                        React.createElement('span',{className:"w-px h-3 bg-white/10"}),
                        React.createElement('span',{className:"text-[8px] text-slate-600 font-mono"},sess.ip)
                      )
                    )
                  ),

                  // زر إنهاء
                  !isMe && React.createElement('button',{
                    onClick:()=>handleTerminateSession(sess),
                    disabled:!!terminatingSession,
                    title:"إنهاء الجلسة",
                    className:`flex-shrink-0 flex flex-col items-center gap-1 px-2.5 py-2 rounded-xl border transition-all active:scale-90 ${
                      isSuspicious
                        ? 'bg-[#C9A84C]/20 border-[#C9A84C]/30 text-[#C9A84C] hover:bg-red-500/30'
                        : 'bg-white/5 border-white/10 text-slate-500 hover:border-[#C9A84C]/30 hover:text-[#C9A84C] hover:bg-[#C9A84C]/10'
                    } disabled:opacity-40`
                  },
                    isTerminating
                      ? React.createElement(I.Spin,{})
                      : React.createElement('svg',{className:"w-4 h-4",fill:"none",viewBox:"0 0 24 24",strokeWidth:"2",stroke:"currentColor"},
                          React.createElement('path',{strokeLinecap:"round",strokeLinejoin:"round",d:"M5.636 5.636a9 9 0 1 0 12.728 12.728M5.636 5.636a9 9 0 1 1 12.728 12.728M5.636 5.636 12 12m0 0 6.364 6.364"})
                        ),
                    React.createElement('span',{className:"text-[7px] font-bold leading-none"},isTerminating?"...":"إنهاء")
                  )
                ),

                // تحذير الوقت المشبوه
                isSuspicious && React.createElement('div',{
                  className:"mt-2.5 flex items-center gap-2 px-3 py-2 rounded-xl bg-[#C9A84C]/10 border border-[#C9A84C]/20"
                },
                  React.createElement('span',{className:"text-sm flex-shrink-0"},"⚠️"),
                  React.createElement('p',{className:"text-[9px] text-red-400 leading-relaxed"},
                    "آخر نشاط كان في الساعة "+new Date(sess.lastSeenAt).getHours()+":"+String(new Date(sess.lastSeenAt).getMinutes()).padStart(2,'0')+
                    " — نشاط في منتصف الليل قد يكون مشبوهاً"
                  )
                )
              )
            );
          })
        )
    ),

    // ══════════════════════════
    //  SECTION: بوابة الموكل
    // ══════════════════════════
    section === 'portal' && React.createElement('div',{className:"space-y-3"},
      // بحث
      React.createElement('div',{className:"relative"},
        React.createElement('input',{
          value:clientSearch,
          onChange:e=>setClientSearch(e.target.value),
          placeholder:"🔍 ابحث باسم الموكل...",
          className:"w-full p-3 pr-4 text-xs rounded-xl border border-white/10 bg-premium-card text-white placeholder-slate-500",
          style:{fontFamily:'Cairo,sans-serif'}
        })
      ),

      filteredClients.length === 0
        ? React.createElement('div',{className:"text-center text-slate-500 text-xs py-10"},"لا يوجد موكلون")
        : filteredClients.map(client => {
            const access = portalAccess.find(p => p.client_id === client.id);
            const hasAccess = !!access;
            const isActive = access?.is_active !== false;

            return React.createElement('div',{
              key:client.id,
              className:"bg-premium-card border border-white/5 rounded-2xl p-3.5 flex items-center gap-3"
            },
              // أفاتار
              React.createElement('div',{className:"w-9 h-9 rounded-xl bg-[#C9A84C]/15 flex items-center justify-center font-black text-sm text-[#C9A84C] flex-shrink-0"},
                (client.full_name||'م').charAt(0)),

              // بيانات
              React.createElement('div',{className:"flex-1 min-w-0"},
                React.createElement('p',{className:"text-xs font-black text-white truncate"},client.full_name),
                hasAccess
                  ? React.createElement('div',{className:"flex items-center gap-2 mt-0.5"},
                      React.createElement('span',{className:`text-[9px] font-bold px-2 py-0.5 rounded-full ${isActive?'bg-[#C9A84C]/15 text-[#C9A84C]':'bg-red-500/15 text-red-400'}`},
                        isActive?'✓ مفعّل':'✗ معطّل'),
                      React.createElement('span',{className:"text-[9px] text-slate-600"},"PIN: "+access.pin)
                    )
                  : React.createElement('p',{className:"text-[10px] text-slate-600 mt-0.5"},"لا يوجد وصول")
              ),

              // زر الإعداد
              React.createElement('button',{
                onClick:()=>setPortalClient(client),
                className:`px-3 py-1.5 rounded-xl text-[10px] font-black border transition-all active:scale-95 ${hasAccess?'bg-[#C9A84C]/15 border-[#C9A84C]/30 text-[#C9A84C]':'bg-[#C9A84C]/15 border-[#C9A84C]/30 text-[#C9A84C]'}`
              }, hasAccess?'تعديل':'إعداد')
            );
          })
    ),

    // ══════════════════════════
    //  SECTION: سجل النشاط
    // ══════════════════════════
    section === 'activity' && React.createElement('div',{className:"space-y-3"},

      // ── بحث حر ──
      React.createElement('div',{className:"relative"},
        React.createElement('input',{
          value: activitySearchInput,
          onChange: e => handleActivitySearchChange(e.target.value),
          placeholder:"🔍 بحث في السجلات...",
          className:"w-full p-2.5 pr-4 text-xs rounded-xl border border-white/10 bg-premium-card text-white placeholder-slate-500",
          style:{fontFamily:'Cairo,sans-serif'}
        }),
        activitySearchInput && React.createElement('button',{
          onClick:()=>{ setActivitySearchInput(''); setActivityFilters((f: any)=>({...f,search:''})); setActivityPage(0); },
          className:"absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white"
        }, React.createElement(I.X,{className:"w-3.5 h-3.5"}))
      ),

      // ── فلاتر متقدمة: نوع الإجراء + التاريخ ──
      React.createElement('div',{className:"flex gap-2"},

        // فلتر نوع الإجراء
        React.createElement('select',{
          value: activityFilters.action,
          onChange: e => { setActivityFilters(f=>({...f,action:e.target.value})); setActivityPage(0); },
          className:"flex-1 p-2 text-[10px] rounded-xl border border-white/10 bg-premium-card text-white",
          style:{fontFamily:'Cairo,sans-serif'}
        },
          React.createElement('option',{value:''},'كل الإجراءات'),
          React.createElement('option',{value:'إضافة'},'➕ إضافة'),
          React.createElement('option',{value:'تعديل'},'✏️ تعديل'),
          React.createElement('option',{value:'حذف'},'🗑️ حذف'),
          React.createElement('option',{value:'تسجيل دخول'},'🔑 تسجيل دخول'),
          React.createElement('option',{value:'تسجيل خروج'},'🚪 تسجيل خروج'),
          React.createElement('option',{value:'إنهاء جلسة'},'⛔ إنهاء جلسة'),
          React.createElement('option',{value:'نسخة احتياطية'},'💾 نسخة احتياطية'),
          React.createElement('option',{value:'تصدير'},'📤 تصدير'),
          React.createElement('option',{value:'تذكير'},'🔔 تذكيرات'),
          React.createElement('option',{value:'قانون'},'⚖️ مكتبة قانونية'),
          React.createElement('option',{value:'بوابة'},'🌐 بوابة الموكل')
        ),

        // فلتر المستخدم
        React.createElement('select',{
          value: activityFilters.user_id,
          onChange: e => { setActivityFilters(f=>({...f,user_id:e.target.value})); setActivityPage(0); },
          className:"flex-1 p-2 text-[10px] rounded-xl border border-white/10 bg-premium-card text-white",
          style:{fontFamily:'Cairo,sans-serif'}
        },
          React.createElement('option',{value:''},'كل المستخدمين'),
          ...lawyers.map((u:any) => React.createElement('option',{key:u.user_id||u.id, value:u.user_id||u.id}, u.full_name||u.email||'مستخدم'))
        )
      ),

      // فلتر نطاق التاريخ
      React.createElement('div',{className:"flex gap-2 items-center"},
        React.createElement('input',{
          type:'date',
          value: activityFilters.from,
          onChange: e => { setActivityFilters(f=>({...f,from:e.target.value})); setActivityPage(0); },
          className:"flex-1 p-2 text-[10px] rounded-xl border border-white/10 bg-premium-card text-white",
          style:{fontFamily:'Cairo,sans-serif'}
        }),
        React.createElement('span',{className:"text-[10px] text-slate-500 shrink-0"},"→"),
        React.createElement('input',{
          type:'date',
          value: activityFilters.to,
          onChange: e => { setActivityFilters(f=>({...f,to:e.target.value})); setActivityPage(0); },
          className:"flex-1 p-2 text-[10px] rounded-xl border border-white/10 bg-premium-card text-white",
          style:{fontFamily:'Cairo,sans-serif'}
        }),
        // زر مسح كل الفلاتر
        (activityFilters.action || activityFilters.user_id || activityFilters.from || activityFilters.to) &&
        React.createElement('button',{
          onClick:()=>{ setActivityFilters({search:activityFilters.search, user_id:'', action:'', from:'', to:''}); setActivityPage(0); },
          className:"shrink-0 px-2 py-2 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-[9px] font-bold active:scale-95"
        },"مسح")
      ),

      // ── عداد النتائج ──
      React.createElement('p',{className:"text-[10px] text-slate-500 px-1"},
        loadingActivity ? "جاري البحث..." :
        activityTotal > ACTIVITY_PAGE_SIZE
          ? `صفحة ${activityPage+1} من ${Math.ceil(activityTotal/ACTIVITY_PAGE_SIZE)} (${activityTotal} سجل)`
          : `${activityTotal} سجل`
      ),

      // ── النتائج ──
      loadingActivity
        ? React.createElement('div',{className:"flex items-center justify-center py-10 gap-2 text-slate-500 text-xs"},
            React.createElement(I.Spin), "جاري التحميل...")

        : activityLog.length === 0
        ? React.createElement('div',{
            className:"bg-premium-card border border-white/5 rounded-xl p-8 text-center space-y-3"
          },
            React.createElement('div',{className:"w-10 h-10 rounded-xl bg-slate-500/10 flex items-center justify-center mx-auto"},
              React.createElement(IconActivity,{className:"w-5 h-5 text-slate-500"})),
            activityFilters.search
              ? React.createElement('p',{className:"text-slate-400 text-xs font-bold"},"لا توجد نتائج للبحث المحدد")
              : React.createElement('p',{className:"text-slate-400 text-xs font-bold"},"لا يوجد سجل نشاط بعد")
          )

        : React.createElement('div',{className:"space-y-1.5"},
            ...activityLog.map((log,i)=>{
              const actionMap = {
                'إضافة':  {bg:'bg-[#C9A84C]/10', border:'border-[#C9A84C]/20', text:'text-[#C9A84C]', badge:'bg-[#C9A84C]/15 text-[#C9A84C]', icon:'➕'},
                'تعديل':  {bg:'bg-[#C9A84C]/10',    border:'border-[#C9A84C]/20',    text:'text-[#C9A84C]',    badge:'bg-[#C9A84C]/15 text-[#C9A84C]',    icon:'✏️'},
                'حذف':    {bg:'bg-red-500/10',     border:'border-red-500/20',     text:'text-red-400',     badge:'bg-red-500/15 text-red-400',     icon:'🗑️'},
                'دخول':   {bg:'bg-[#C9A84C]/10',  border:'border-[#C9A84C]/20',  text:'text-[#C9A84C]',  badge:'bg-[#C9A84C]/15 text-[#C9A84C]',  icon:'🔑'},
                'تصدير':  {bg:'bg-[#C9A84C]/10',   border:'border-[#C9A84C]/20',   text:'text-[#C9A84C]',   badge:'bg-[#C9A84C]/15 text-[#C9A84C]',   icon:'📤'},
              };
              const action = log.action || '';
              const colorKey = Object.keys(actionMap).find(k=>action.includes(k));
              const s = colorKey ? actionMap[colorKey] : {bg:'bg-white/5',border:'border-white/5',text:'text-slate-400',badge:'bg-white/10 text-slate-400',icon:'📝'};

              const timeStr = log.created_at
                ? new Date(log.created_at).toLocaleString('ar-EG',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'})
                : '';

              return React.createElement('div',{
                key:log.id||i,
                className:`bg-premium-card border ${s.border} rounded-xl p-2.5 space-y-1.5`
              },
                // ── صف 1: الأيقونة + نوع الإجراء + المنفذ + التوقيت ──
                React.createElement('div',{className:"flex items-center gap-2"},
                  React.createElement('div',{className:`w-6 h-6 rounded-lg ${s.bg} flex items-center justify-center text-[10px] flex-shrink-0`},
                    s.icon),
                  React.createElement('span',{className:`text-[10px] font-black ${s.text}`}, action),
                  React.createElement('div',{className:"flex-1"}),
                  log.user_name && React.createElement('span',{
                    className:"text-[9px] bg-white/8 text-slate-300 px-1.5 py-0.5 rounded-full font-bold"
                  }, "👤 "+log.user_name),
                  React.createElement('span',{className:"text-[9px] text-slate-600"}, timeStr)
                ),

                // ── صف 2: التفاصيل الكاملة ──
                log.details && React.createElement('p',{
                  className:"text-[10px] text-slate-300 leading-relaxed pr-8 border-r-2 border-white/10"
                }, log.details),

                // ── صف 3: وسوم السياق ──
                (log.client_name || log.case_name || log.case_type) && React.createElement('div',{className:"flex flex-wrap gap-1 pr-8"},
                  log.client_name && React.createElement('span',{
                    className:"text-[9px] bg-[#C9A84C]/10 text-[#C9A84C] border border-[#C9A84C]/20 px-1.5 py-0.5 rounded-full"
                  },"👥 "+log.client_name),
                  log.case_name && React.createElement('span',{
                    className:"text-[9px] bg-[#C9A84C]/10 text-[#C9A84C] border border-[#C9A84C]/20 px-1.5 py-0.5 rounded-full"
                  },"📁 "+log.case_name),
                  log.case_type && React.createElement('span',{
                    className:"text-[9px] bg-[#C9A84C]/10 text-[#C9A84C] border border-[#C9A84C]/20 px-1.5 py-0.5 rounded-full"
                  },"⚖️ "+log.case_type)
                )
              );
            }),

            // ── Pagination ──
            activityTotal > ACTIVITY_PAGE_SIZE && React.createElement('div',{
              className:"flex items-center justify-between pt-1"
            },
              React.createElement('button',{
                onClick:()=>setActivityPage(p=>Math.max(0,p-1)),
                disabled:activityPage===0,
                className:"flex items-center gap-1 px-3 py-1.5 rounded-xl text-[10px] font-bold bg-white/8 text-slate-300 disabled:opacity-30 active:scale-95 transition-transform"
              }, React.createElement(I.ChevronRight,{className:"w-3 h-3"}), "السابق"),
              React.createElement('p',{className:"text-[10px] text-slate-500"},
                `${activityPage+1} / ${Math.ceil(activityTotal/ACTIVITY_PAGE_SIZE)}`),
              React.createElement('button',{
                onClick:()=>setActivityPage(p=>p+1),
                disabled:(activityPage+1)*ACTIVITY_PAGE_SIZE>=activityTotal,
                className:"flex items-center gap-1 px-3 py-1.5 rounded-xl text-[10px] font-bold bg-white/8 text-slate-300 disabled:opacity-30 active:scale-95 transition-transform"
              }, "التالي", React.createElement(I.ChevronLeft,{className:"w-3 h-3"}))
            )
          )
        ),

    // ══════════════════════════
    //  SECTION: الأمان
    // ══════════════════════════
    section === 'security' && React.createElement('div',{className:"space-y-3"},

      // ── هيدر القسم ──
      React.createElement('div',{className:"flex items-center gap-2 p-3 rounded-xl bg-[#C9A84C]/10 border border-[#C9A84C]/20"},
        React.createElement('div',{className:"w-8 h-8 rounded-xl bg-[#C9A84C]/20 flex items-center justify-center text-[#C9A84C]"},
          React.createElement(IconSecurity)
        ),
        React.createElement('div',null,
          React.createElement('p',{className:"text-xs font-black text-white"},"إدارة الأمان"),
          React.createElement('p',{className:"text-[10px] text-[#C9A84C]"},"تحكم كامل في أمان حسابات المستخدمين")
        )
      ),

      // ── قائمة المستخدمين مع خيارات الأمان ──
      lawyers.length === 0
        ? React.createElement('div',{className:"text-center text-slate-500 text-xs py-10"},"لا يوجد مستخدمون")
        : lawyers.map(user => {
            const rc = ROLE_CONFIG[user.role] || ROLE_CONFIG.viewer;
            const isLocked = user.is_locked === true;
            const failedAttempts = user.failed_login_attempts || 0;
            const mustChange = user.must_change_password === true;

            return React.createElement('div',{
              key:user.id,
              className:`bg-premium-card border rounded-2xl overflow-hidden ${isLocked?'border-red-500/30':'border-white/5'}`
            },
              // رأس الكارت
              React.createElement('div',{className:"p-3 flex items-center gap-3"},
                React.createElement('div',{
                  className:`w-9 h-9 rounded-xl flex items-center justify-center font-black text-sm flex-shrink-0 relative ${rc.bg} ${rc.color}`
                },
                  (user.full_name||'م').charAt(0),
                  isLocked && React.createElement('div',{
                    className:"absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-red-500 flex items-center justify-center",
                  }, React.createElement('svg',{className:"w-2.5 h-2.5 text-white",fill:"none",viewBox:"0 0 24 24",strokeWidth:"2.5",stroke:"currentColor"},
                    React.createElement('path',{strokeLinecap:"round",strokeLinejoin:"round",d:"M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75M6 21h12a2.25 2.25 0 0 0 2.25-2.25v-6.75A2.25 2.25 0 0 0 18 9.75H6a2.25 2.25 0 0 0-2.25 2.25v6.75A2.25 2.25 0 0 0 6 21Z"})
                  ))
                ),
                React.createElement('div',{className:"flex-1 min-w-0"},
                  React.createElement('div',{className:"flex items-center gap-1.5"},
                    React.createElement('p',{className:"text-xs font-black text-white truncate"},user.full_name||'—'),
                    isLocked && React.createElement('span',{className:"text-[8px] bg-red-500/20 text-red-400 px-1.5 py-0.5 rounded-full font-bold"},"🔒 مقفول"),
                    mustChange && React.createElement('span',{className:"text-[8px] bg-[#C9A84C]/20 text-[#C9A84C] px-1.5 py-0.5 rounded-full font-bold"},"⚠️ يجب تغيير الكلمة")
                  ),
                  React.createElement('p',{className:"text-[10px] text-slate-500"},user.email||''),
                  failedAttempts > 0 && React.createElement('p',{className:"text-[9px] text-red-400 mt-0.5"},
                    "⚠️ "+failedAttempts+" محاولة فاشلة")
                )
              ),

              // أزرار الأمان
              React.createElement('div',{
                className:"grid grid-cols-3 gap-px",
                style:{background:'rgba(255,255,255,0.05)'}
              },
                // تغيير كلمة المرور
                React.createElement('button',{
                  onClick:()=>setChangePassUser(user),
                  className:"flex flex-col items-center gap-1 py-2.5 bg-premium-card hover:bg-[#C9A84C]/10 transition-colors active:scale-95"
                },
                  React.createElement(IconKey,{className:"w-3.5 h-3.5 text-[#C9A84C]"}),
                  React.createElement('span',{className:"text-[8px] text-slate-400"},"تغيير كلمة المرور")
                ),

                // تسجيل خروج من جميع الأجهزة
                React.createElement('button',{
                  onClick:()=>setConfirmSignOut(user),
                  className:"flex flex-col items-center gap-1 py-2.5 bg-premium-card hover:bg-[#C9A84C]/10 transition-colors active:scale-95"
                },
                  React.createElement(IconDevices,{className:"w-3.5 h-3.5 text-[#C9A84C]"}),
                  React.createElement('span',{className:"text-[8px] text-slate-400"},"تسجيل خروج")
                ),

                // قفل/فتح الحساب
                React.createElement('button',{
                  onClick:()=>setConfirmLock(user),
                  className:`flex flex-col items-center gap-1 py-2.5 bg-premium-card transition-colors active:scale-95 ${isLocked?'hover:bg-[#C9A84C]/10':'hover:bg-red-500/10'}`
                },
                  React.createElement(IconLockSm,{className:`w-3.5 h-3.5 ${isLocked?'text-[#C9A84C]':'text-red-400'}`}),
                  React.createElement('span',{className:"text-[8px] text-slate-400"},isLocked?'فتح الحساب':'قفل الحساب')
                )
              )
            );
          }),

      // ── بطاقة 2FA (مستقبلي) ──
      React.createElement('div',{
        className:"p-4 rounded-2xl border border-dashed border-white/15 bg-white/2 space-y-3"
      },
        React.createElement('div',{className:"flex items-center gap-2"},
          React.createElement('div',{className:"w-8 h-8 rounded-xl bg-[#C9A84C]/15 flex items-center justify-center"},
            React.createElement('svg',{className:"w-4 h-4 text-[#C9A84C]",fill:"none",viewBox:"0 0 24 24",strokeWidth:"1.5",stroke:"currentColor"},
              React.createElement('path',{strokeLinecap:"round",strokeLinejoin:"round",d:"M10.5 1.5H8.25A2.25 2.25 0 0 0 6 3.75v16.5a2.25 2.25 0 0 0 2.25 2.25h7.5A2.25 2.25 0 0 0 18 20.25V3.75a2.25 2.25 0 0 0-2.25-2.25H13.5m-3 0V3h3V1.5m-3 0h3m-3 8.25h3m-3 3h3m-3 3h3"}))
          ),
          React.createElement('div',null,
            React.createElement('p',{className:"text-xs font-black text-white"},"المصادقة الثنائية (2FA)"),
            React.createElement('span',{className:"text-[8px] bg-[#C9A84C]/20 text-[#C9A84C] px-1.5 py-0.5 rounded-full font-bold"},"قريباً")
          )
        ),
        React.createElement('p',{className:"text-[10px] text-slate-500 leading-relaxed"},
          "سيتم إضافة دعم المصادقة الثنائية عبر تطبيق Google Authenticator أو الرسائل النصية في الإصدار القادم."),
        React.createElement('div',{className:"grid grid-cols-2 gap-2"},
          ['Google Authenticator', 'SMS OTP'].map(method=>
            React.createElement('div',{
              key:method,
              className:"flex items-center gap-2 p-2 rounded-xl bg-white/4 border border-white/8"
            },
              React.createElement('div',{className:"w-2 h-2 rounded-full bg-red-500/40"}),
              React.createElement('span',{className:"text-[9px] text-slate-500"},method)
            )
          )
        )
      ),

      // ── إعدادات قفل الحساب ──
      React.createElement('div',{className:"p-4 rounded-2xl bg-red-500/5 border border-red-500/15 space-y-3"},
        React.createElement('div',{className:"flex items-center gap-2"},
          React.createElement(IconWarning,{className:"w-4 h-4 text-red-400"}),
          React.createElement('p',{className:"text-xs font-black text-white"},"سياسة قفل الحساب")
        ),
        React.createElement('p',{className:"text-[10px] text-slate-500 leading-relaxed"},
          "الحسابات تُقفل تلقائياً بعد 5 محاولات تسجيل دخول فاشلة. يمكنك فتح أي حساب مقفول من الأزرار أعلاه."),
        React.createElement('div',{className:"flex items-center gap-2 p-2 rounded-xl bg-white/5"},
          React.createElement('div',{className:"w-5 h-5 rounded-lg bg-red-500/20 flex items-center justify-center"},
            React.createElement('span',{className:"text-[10px]"},"5")),
          React.createElement('div',null,
            React.createElement('p',{className:"text-[10px] font-bold text-white"},"الحد الأقصى للمحاولات"),
            React.createElement('p',{className:"text-[9px] text-slate-500"},"يتم القفل التلقائي بعد 5 محاولات فاشلة")
          )
        )
      )
    ),

    // ══════════════════════════
    //  SECTION: النسخ الاحتياطي
    // ══════════════════════════
    section === 'backup' && React.createElement('div',{className:"space-y-4"},

      // ── هيدر + زر إنشاء ──
      React.createElement('div',{
        className:"p-4 rounded-2xl bg-gradient-to-br from-[#C9A84C]/10 to-[#C9A84C]/05 border border-[#C9A84C]/20 space-y-3"
      },
        React.createElement('div',{className:"flex items-center gap-3"},
          React.createElement('div',{className:"w-10 h-10 rounded-xl bg-[#C9A84C]/20 flex items-center justify-center text-[#C9A84C]"},
            React.createElement(IconBackup)
          ),
          React.createElement('div',{className:"flex-1"},
            React.createElement('p',{className:"text-sm font-black text-white"},"النسخ الاحتياطي"),
            React.createElement('p',{className:"text-[10px] text-[#C9A84C]"},
              "يشمل: القضايا، الموكلين، الجلسات، الأتعاب، المستندات")
          )
        ),

        // زر إنشاء نسخة
        React.createElement('button',{
          onClick: handleCreateBackup,
          disabled: creatingBackup,
          className:"w-full py-3 rounded-xl text-xs font-black text-white bg-gradient-to-tr from-[#C9A84C] to-[#C9A84C]/80 shadow-lg active:scale-95 transition-transform disabled:opacity-60 flex items-center justify-center gap-2"
        },
          creatingBackup
            ? React.createElement(React.Fragment,null,
                React.createElement(I.Spin),
                React.createElement('span',null, backupProgress || 'جاري إنشاء النسخة...')
              )
            : React.createElement(React.Fragment,null,
                React.createElement('span',{className:"text-base"},"💾"),
                React.createElement('span',null,"إنشاء نسخة احتياطية الآن")
              )
        ),

        // تحذير مهم
        React.createElement('div',{className:"flex items-start gap-2"},
          React.createElement(IconWarning,{className:"w-3.5 h-3.5 text-[#C9A84C] flex-shrink-0 mt-0.5"}),
          React.createElement('p',{className:"text-[9px] text-slate-500 leading-relaxed"},
            "النسخ الاحتياطية تُخزَّن في Supabase ويمكن تنزيلها كملف JSON. احتفظ بنسخة محلية دورياً.")
        )
      ),

      // ── النسخ السابقة ──
      React.createElement('div',null,
        React.createElement('div',{className:"flex items-center justify-between mb-2"},
          React.createElement('p',{className:"text-xs font-black text-white"},"النسخ السابقة"),
          React.createElement('button',{
            onClick:fetchBackups,
            className:"text-[10px] text-slate-500 hover:text-white flex items-center gap-1"
          }, React.createElement(I.Refresh,{className:"w-3 h-3"}), "تحديث")
        ),

        loadingBackups
          ? React.createElement('div',{className:"flex items-center justify-center py-8 gap-2 text-slate-500 text-xs"},
              React.createElement(I.Spin), "جاري التحميل...")

          : backups.length === 0
          ? React.createElement('div',{className:"bg-premium-card border border-white/5 rounded-xl p-8 text-center space-y-2"},
              React.createElement('p',{className:"text-2xl"},"💾"),
              React.createElement('p',{className:"text-slate-400 text-xs font-bold"},"لا توجد نسخ احتياطية بعد"),
              React.createElement('p',{className:"text-slate-600 text-[10px]"},"أنشئ أول نسخة الآن لحماية بياناتك")
            )

          : React.createElement('div',{className:"space-y-2"},
              ...backups.map((backup,i) => {
                const date = new Date(backup.created_at);
                const isToday = new Date().toDateString() === date.toDateString();
                return React.createElement('div',{
                  key:backup.id||i,
                  className:"bg-premium-card border border-white/5 rounded-2xl overflow-hidden"
                },
                  // معلومات النسخة
                  React.createElement('div',{className:"p-3 flex items-center gap-3"},
                    React.createElement('div',{className:`w-10 h-10 rounded-xl flex items-center justify-center font-black text-lg flex-shrink-0 ${i===0?'bg-[#C9A84C]/15':'bg-white/5'}`},
                      i===0?'🟢':'💾'),
                    React.createElement('div',{className:"flex-1 min-w-0"},
                      React.createElement('div',{className:"flex items-center gap-2"},
                        React.createElement('p',{className:"text-xs font-black text-white"},
                          date.toLocaleDateString('ar-EG',{year:'numeric',month:'long',day:'numeric'})),
                        i===0 && React.createElement('span',{className:"text-[8px] bg-[#C9A84C]/20 text-[#C9A84C] px-1.5 py-0.5 rounded-full font-bold"},"الأحدث"),
                        isToday && React.createElement('span',{className:"text-[8px] bg-[#C9A84C]/20 text-[#C9A84C] px-1.5 py-0.5 rounded-full font-bold"},"اليوم")
                      ),
                      React.createElement('div',{className:"flex items-center gap-3 mt-0.5"},
                        React.createElement('p',{className:"text-[9px] text-slate-500"},
                          date.toLocaleTimeString('ar-EG',{hour:'2-digit',minute:'2-digit'})),
                        backup.rows_count && React.createElement('span',{className:"text-[9px] text-slate-600"},
                          (backup.rows_count).toLocaleString('ar-EG')+" سجل"),
                        backup.size_kb && React.createElement('span',{className:"text-[9px] text-slate-600"},
                          backup.size_kb+" KB"),
                        backup.created_by_name && React.createElement('span',{className:"text-[9px] text-slate-600"},
                          "بواسطة: "+backup.created_by_name)
                      )
                    )
                  ),

                  // أزرار
                  React.createElement('div',{
                    className:"grid grid-cols-2 gap-px",
                    style:{background:'rgba(255,255,255,0.04)'}
                  },
                    // تنزيل
                    React.createElement('button',{
                      onClick:()=>handleDownloadBackup(backup),
                      className:"flex items-center justify-center gap-1.5 py-2.5 bg-premium-card hover:bg-[#C9A84C]/10 transition-colors active:scale-95"
                    },
                      React.createElement('span',{className:"text-xs"},"📥"),
                      React.createElement('span',{className:"text-[10px] font-bold text-[#C9A84C]"},"تنزيل JSON")
                    ),

                    // استعادة
                    React.createElement('button',{
                      onClick:()=>setConfirmRestore(backup),
                      className:"flex items-center justify-center gap-1.5 py-2.5 bg-premium-card hover:bg-[#C9A84C]/10 transition-colors active:scale-95"
                    },
                      React.createElement('span',{className:"text-xs"},"🔄"),
                      React.createElement('span',{className:"text-[10px] font-bold text-[#C9A84C]"},"استعادة")
                    )
                  )
                );
              })
            )
      )
    ),

    // ══════════════════════════
    //  SECTION: إعدادات المكتب
    // ══════════════════════════
    section === 'office' && React.createElement('div',{className:"space-y-4 fade-in"},

      // ── هيدر ──
      React.createElement('div',{className:"flex items-center gap-2 p-3 rounded-xl bg-[#C9A84C]/10 border border-[#C9A84C]/20"},
        React.createElement('div',{className:"w-8 h-8 rounded-xl bg-[#C9A84C]/20 flex items-center justify-center"},
          React.createElement(IconOffice)
        ),
        React.createElement('div',null,
          React.createElement('p',{className:"text-xs font-black text-white"},"إعدادات المكتب"),
          React.createElement('p',{className:"text-[10px] text-[#C9A84C]"},"الهوية البصرية وبيانات التواصل والفاتورة")
        )
      ),

      loadingOffice
        ? React.createElement('div',{className:"flex items-center justify-center py-10 gap-2 text-slate-500 text-xs"},
            React.createElement(I.Spin), "جاري التحميل...")

        : React.createElement('div',{className:"space-y-4"},

          // ── الشعار ──
          React.createElement('div',{className:"bg-premium-card border border-white/5 rounded-2xl p-4 space-y-3"},
            React.createElement('p',{className:"text-xs font-black text-white"},"🖼 شعار المكتب"),
            React.createElement('div',{className:"flex items-center gap-4"},
              // معاينة الشعار
              React.createElement('div',{
                className:"w-20 h-20 rounded-2xl border-2 border-dashed border-white/15 flex items-center justify-center overflow-hidden flex-shrink-0",
                style:{background:'rgba(255,255,255,0.03)'}
              },
                logoPreview
                  ? React.createElement('img',{src:logoPreview, alt:"شعار المكتب", className:"w-full h-full object-contain"})
                  : React.createElement('div',{className:"text-center"},
                      React.createElement('p',{className:"text-2xl"},"🏛"),
                      React.createElement('p',{className:"text-[8px] text-slate-600 mt-1"},"لا يوجد شعار")
                    )
              ),
              React.createElement('div',{className:"flex-1 space-y-2"},
                React.createElement('label',{
                  className:"flex items-center justify-center gap-2 w-full py-2.5 rounded-xl border border-dashed border-[#C9A84C]/30 bg-[#C9A84C]/5 text-[#C9A84C] text-xs font-bold cursor-pointer active:scale-95 transition-transform"
                },
                  React.createElement('span',null,"📤"),
                  React.createElement('span',null,"رفع شعار"),
                  React.createElement('input',{
                    type:"file", accept:"image/*", className:"hidden",
                    onChange: e => {
                      const f = e.target.files?.[0];
                      if (!f) return;
                      setLogoFile(f);
                      const reader = new FileReader();
                      reader.onload = ev => setLogoPreview(ev.target.result as string);
                      reader.readAsDataURL(f);
                    }
                  })
                ),
                logoPreview && React.createElement('button',{
                  onClick:()=>{ setLogoPreview(null); setLogoFile(null); setOfficeSettings(s=>({...s,logoUrl:''})); },
                  className:"w-full py-1.5 rounded-xl border border-red-500/20 text-red-400 text-[10px] font-bold active:scale-95 transition-transform"
                },"حذف الشعار"),
                React.createElement('p',{className:"text-[9px] text-slate-600"},"PNG أو JPG — بحد أقصى 2MB")
              )
            )
          ),

          // ── بيانات المكتب ──
          React.createElement('div',{className:"bg-premium-card border border-white/5 rounded-2xl p-4 space-y-3"},
            React.createElement('p',{className:"text-xs font-black text-white"},"🏛 بيانات المكتب"),
            ...[
              {key:'name', label:'اسم المكتب', placeholder:'سَنَد', required:true},
              {key:'slogan', label:'الشعار النصي / السلوجن', placeholder:'العدالة أمانة'},
              {key:'licenseNumber', label:'رقم الترخيص المهني', placeholder:'12345/2024'},
            ].map(f => React.createElement('div',{key:f.key},
              React.createElement('label',{className:"text-[10px] font-bold text-slate-400 block mb-1"},
                f.label, f.required && React.createElement('span',{className:"text-red-400 mr-1"},"*")),
              React.createElement('input',{
                value: officeSettings[f.key] || '',
                onChange: e => setOfficeSettings(s=>({...s,[f.key]:e.target.value})),
                placeholder: f.placeholder,
                className:"w-full p-2.5 text-xs rounded-xl border border-white/10 bg-white/5 text-white placeholder-slate-600",
                style:{fontFamily:'Cairo,sans-serif'}
              })
            ))
          ),

          // ── بيانات التواصل ──
          React.createElement('div',{className:"bg-premium-card border border-white/5 rounded-2xl p-4 space-y-3"},
            React.createElement('p',{className:"text-xs font-black text-white"},"📞 بيانات التواصل"),
            ...[
              {key:'phone',    label:'رقم الهاتف الرئيسي', placeholder:'+966500000000', type:'tel'},
              {key:'phone2',   label:'رقم هاتف إضافي',     placeholder:'+966500000001', type:'tel'},
              {key:'whatsapp', label:'واتساب',              placeholder:'+966500000000', type:'tel'},
              {key:'email',    label:'البريد الإلكتروني',   placeholder:'office@law.com', type:'email'},
              {key:'website',  label:'الموقع الإلكتروني',   placeholder:'www.example-law.com', type:'url'},
              {key:'address',  label:'العنوان',              placeholder:'الرياض، حي العليا، شارع ...'},
            ].map(f => React.createElement('div',{key:f.key},
              React.createElement('label',{className:"text-[10px] font-bold text-slate-400 block mb-1"},f.label),
              React.createElement('input',{
                value: officeSettings[f.key] || '',
                type: f.type || 'text',
                onChange: e => setOfficeSettings(s=>({...s,[f.key]:e.target.value})),
                placeholder: f.placeholder,
                className:"w-full p-2.5 text-xs rounded-xl border border-white/10 bg-white/5 text-white placeholder-slate-600",
                style:{fontFamily:'Cairo,sans-serif',direction:f.type==='url'||f.type==='email'||f.type==='tel'?'ltr':'rtl'}
              })
            )),

            // السوشيال ميديا
            React.createElement('div',{className:"grid grid-cols-2 gap-2"},
              ...[
                {key:'facebook',  label:'فيسبوك',   placeholder:'facebook.com/...'},
                {key:'instagram', label:'إنستجرام',  placeholder:'instagram.com/...'},
              ].map(f => React.createElement('div',{key:f.key},
                React.createElement('label',{className:"text-[10px] font-bold text-slate-400 block mb-1"},f.label),
                React.createElement('input',{
                  value: officeSettings[f.key] || '',
                  onChange: e => setOfficeSettings(s=>({...s,[f.key]:e.target.value})),
                  placeholder: f.placeholder,
                  className:"w-full p-2 text-[10px] rounded-xl border border-white/10 bg-white/5 text-white placeholder-slate-600",
                  style:{fontFamily:'Cairo,sans-serif',direction:'ltr'}
                })
              ))
            )
          ),

          // ── تخصيص البراند ──
          React.createElement('div',{className:"bg-premium-card border border-white/5 rounded-2xl p-4 space-y-3"},
            React.createElement('p',{className:"text-xs font-black text-white"},"🎨 ألوان البراند"),
            React.createElement('div',{className:"grid grid-cols-2 gap-3"},
              ...[
                {key:'brandColor',  label:'اللون الرئيسي',  hint:'الذهبي / العنوان'},
                {key:'accentColor', label:'اللون الثانوي',  hint:'الخلفية / الداكن'},
              ].map(f => React.createElement('div',{key:f.key, className:"space-y-2"},
                React.createElement('label',{className:"text-[10px] font-bold text-slate-400 block"},f.label),
                React.createElement('div',{className:"flex items-center gap-2"},
                  React.createElement('input',{
                    type:"color",
                    value: officeSettings[f.key] || '#D4AF37',
                    onChange: e => setOfficeSettings(s=>({...s,[f.key]:e.target.value})),
                    className:"w-10 h-10 rounded-xl border border-white/10 cursor-pointer bg-transparent",
                    style:{padding:'2px'}
                  }),
                  React.createElement('div',{className:"flex-1"},
                    React.createElement('div',{
                      className:"w-full h-8 rounded-xl border border-white/10",
                      style:{background: officeSettings[f.key] || '#D4AF37'}
                    }),
                    React.createElement('p',{className:"text-[9px] text-slate-600 mt-1"},f.hint)
                  )
                )
              ))
            ),
            // معاينة البراند
            React.createElement('div',{
              className:"p-3 rounded-xl border",
              style:{background: officeSettings.accentColor || '#1e3a5f', borderColor: officeSettings.brandColor || '#D4AF37'}
            },
              React.createElement('p',{className:"text-[10px] font-black", style:{color: officeSettings.brandColor || '#D4AF37'}},
                officeSettings.name || 'اسم المكتب'),
              React.createElement('p',{className:"text-[9px] text-white/60 mt-0.5"},
                officeSettings.slogan || 'الشعار النصي')
            )
          ),

          // ── بيانات الفاتورة ──
          React.createElement('div',{className:"bg-premium-card border border-white/5 rounded-2xl p-4 space-y-3"},
            React.createElement('p',{className:"text-xs font-black text-white"},"🧾 بيانات الفاتورة"),
            ...[
              {key:'taxNumber',      label:'الرقم الضريبي',          placeholder:'3001234567890001'},
              {key:'invoicePrefix',  label:'بادئة رقم الفاتورة',     placeholder:'INV أو FAT'},
            ].map(f => React.createElement('div',{key:f.key},
              React.createElement('label',{className:"text-[10px] font-bold text-slate-400 block mb-1"},f.label),
              React.createElement('input',{
                value: officeSettings[f.key] || '',
                onChange: e => setOfficeSettings(s=>({...s,[f.key]:e.target.value})),
                placeholder: f.placeholder,
                className:"w-full p-2.5 text-xs rounded-xl border border-white/10 bg-white/5 text-white placeholder-slate-600",
                style:{fontFamily:'Cairo,sans-serif'}
              })
            )),
            React.createElement('div',null,
              React.createElement('label',{className:"text-[10px] font-bold text-slate-400 block mb-1"},"تذييل الفاتورة"),
              React.createElement('textarea',{
                value: officeSettings.invoiceFooter || '',
                onChange: e => setOfficeSettings(s=>({...s,invoiceFooter:e.target.value})),
                placeholder:"شكراً لثقتكم — جميع الحقوق محفوظة لسَنَد",
                rows:3,
                className:"w-full p-2.5 text-xs rounded-xl border border-white/10 bg-white/5 text-white placeholder-slate-600 resize-none",
                style:{fontFamily:'Cairo,sans-serif'}
              })
            ),

            // معاينة رقم الفاتورة
            React.createElement('div',{className:"flex items-center gap-2 p-2 rounded-xl bg-white/4 border border-white/8"},
              React.createElement('p',{className:"text-[9px] text-slate-500"},"مثال على رقم الفاتورة:"),
              React.createElement('p',{className:"text-[10px] font-black text-premium-gold font-mono"},
                (officeSettings.invoicePrefix || 'INV') + '-2024-0001')
            )
          ),

          // ── زر الحفظ ──
          React.createElement('button',{
            onClick: handleSaveOfficeSettings,
            disabled: savingOffice || !officeSettings.name?.trim(),
            className:"w-full py-3.5 rounded-xl text-sm font-black text-premium-bg bg-gradient-to-tr from-[#C9A84C] to-[#E8C97A] shadow-lg active:scale-95 transition-transform disabled:opacity-50 flex items-center justify-center gap-2"
          },
            savingOffice
              ? React.createElement(React.Fragment,null, React.createElement(I.Spin), "جاري الحفظ...")
              : React.createElement(React.Fragment,null, React.createElement('span',null,"💾"), "حفظ إعدادات المكتب")
          )
        )
    ),

    // ══════════════════════════
    //  SECTION: المكتبة القانونية
    // ══════════════════════════
    section === 'legal_library' && React.createElement('div',{className:"space-y-3 fade-in"},

      // شرح بسيط
      React.createElement('div',{className:"bg-premium-card border border-teal-500/15 rounded-2xl p-3.5 flex items-start gap-2.5"},
        React.createElement('div',{className:"w-8 h-8 rounded-xl bg-teal-500/10 flex items-center justify-center text-teal-400 shrink-0"},
          React.createElement(I.Doc)
        ),
        React.createElement('p',{className:"text-[11px] text-slate-400 leading-relaxed"},
          "القوانين المرفوعة هنا تُستخدم كمصدر يعتمد عليه المساعد القانوني الذكي عند الإجابة. ارفع ملف PDF لكل قانون، وصنّفه، وسيتم استخراج المواد منه تلقائياً."
        )
      ),

      loadingLaws
        ? React.createElement('div',{className:"bg-premium-card border border-white/5 rounded-xl p-10 text-center text-slate-500 text-xs"},
            React.createElement(I.Spin), React.createElement('span',{className:"mr-2"},"جاري التحميل...")
          )
        : laws.length === 0
          ? React.createElement('div',{className:"bg-premium-card border border-white/5 rounded-xl p-10 text-center text-slate-500 text-xs"},"لا توجد قوانين مضافة بعد")
          : laws.map(law => {
              const cat = legalCategories.find(c => c.id === law.category_id);
              const statusCfg = ({
                pending:    {label:'بانتظار المعالجة', bg:'rgba(148,163,184,0.12)', color:'#94a3b8'},
                processing: {label:'قيد المعالجة',      bg:'rgba(96,165,250,0.12)', color:'#60a5fa'},
                completed:  {label:'مكتمل المعالجة',    bg:'rgba(74,222,128,0.12)', color:'#4ade80'},
                failed:     {label:'فشلت المعالجة',     bg:'rgba(248,113,113,0.12)', color:'#f87171'},
              })[law.status] || {label:law.status, bg:'rgba(148,163,184,0.12)', color:'#94a3b8'};

              return React.createElement('div',{
                key: law.id,
                className:"bg-premium-card border border-white/5 rounded-2xl p-4 space-y-2.5"
              },
                // العنوان + الحالة
                React.createElement('div',{className:"flex items-start justify-between gap-2"},
                  React.createElement('div',{className:"flex-1 min-w-0"},
                    React.createElement('p',{className:"text-xs font-black text-white leading-snug"}, law.title),
                    React.createElement('p',{className:"text-[10px] text-slate-500 mt-0.5"},
                      [law.law_number ? `رقم ${law.law_number}` : null, law.law_year ? `لسنة ${law.law_year}` : null].filter(Boolean).join(' ') || '—'
                    )
                  ),
                  React.createElement('span',{
                    className:"text-[9.5px] font-black px-2 py-1 rounded-lg shrink-0",
                    style:{background:statusCfg.bg, color:statusCfg.color}
                  }, statusCfg.label)
                ),

                // التصنيف + عدد المواد
                React.createElement('div',{className:"flex items-center gap-2"},
                  cat && React.createElement('span',{
                    className:"text-[9.5px] font-bold px-2 py-1 rounded-lg",
                    style:{background:'rgba(45,212,191,0.1)', color:'#2dd4bf'}
                  }, cat.name_ar),
                  React.createElement('span',{className:"text-[9.5px] font-bold px-2 py-1 rounded-lg bg-white/5 text-slate-400"},
                    `${law.articles_count || 0} مادة`
                  )
                ),

                law.processing_error && React.createElement('p',{className:"text-[10px] text-red-400 leading-relaxed"},
                  "خطأ: " + law.processing_error
                ),

                // شريط التقدم أثناء المعالجة
                processingLaw?.id === law.id && React.createElement('div',{className:"space-y-1.5"},
                  React.createElement('div',{className:"flex items-center justify-between text-[10px] text-slate-400"},
                    React.createElement('span',null, 'جاري استخراج المواد من الملف...'),
                    React.createElement(I.Spin)
                  ),
                  React.createElement('div',{className:"h-1.5 rounded-full bg-white/5 overflow-hidden"},
                    React.createElement('div',{className:"h-full bg-teal-400 animate-pulse",style:{width:'100%'}})
                  )
                ),

                // زر معالجة / إعادة معالجة
                !processingLaw && React.createElement('button',{
                  onClick:()=>handleProcessLaw(law),
                  disabled: !!processingLaw,
                  className:"w-full flex items-center justify-center gap-1.5 py-2 rounded-xl text-[11px] font-black active:scale-95 transition-transform disabled:opacity-50",
                  style:{background:'rgba(45,212,191,0.1)', color:'#2dd4bf', border:'1px solid rgba(45,212,191,0.2)'}
                },
                  React.createElement(I.Refresh),
                  law.status === 'completed' ? 'إعادة معالجة القانون' : 'معالجة القانون واستخراج المواد'
                ),

                // أزرار التحكم
                React.createElement('div',{className:"flex items-center gap-2 pt-1"},
                  React.createElement('button',{
                    onClick:()=>{ setEditingLaw(law); setShowLawModal(true); },
                    className:"flex-1 flex items-center justify-center gap-1 py-2 rounded-xl bg-white/5 border border-white/10 text-slate-300 text-[11px] font-bold active:scale-95 transition-transform"
                  }, React.createElement(I.Edit), "تعديل"),
                  React.createElement('button',{
                    onClick:()=>setConfirmDeleteLaw(law),
                    className:"flex-1 flex items-center justify-center gap-1 py-2 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-[11px] font-bold active:scale-95 transition-transform"
                  }, React.createElement(I.Trash), "حذف")
                )
              );
            })
    ),


    editUser && React.createElement(EditUserModal,{
      user:editUser, onSave:handleEditUser,
      onClose:()=>setEditUser(null), saving
    }),

    showAddUser && React.createElement(AddUserModal,{
      onSave:handleAddUser,
      onClose:()=>setShowAddUser(false), saving
    }),

    showAddPortalUser && React.createElement(AddPortalUserModal,{
      clients, portalAccess,
      onSave: async (data) => { await handleSavePortal(data); setShowAddPortalUser(false); },
      onClose:()=>setShowAddPortalUser(false), saving: savingPortal
    }),

    portalClient && React.createElement(ClientPortalModal,{
      client:portalClient, portalAccess,
      onSave:handleSavePortal,
      onClose:()=>setPortalClient(null), saving: savingPortal
    }),

    // مودال تغيير كلمة المرور
    changePassUser && React.createElement(ChangePasswordModal,{
      user:changePassUser,
      onSave:handleChangePassword,
      onClose:()=>setChangePassUser(null),
      saving
    }),

    // مودال إضافة / تعديل قانون في المكتبة القانونية
    showLawModal && React.createElement(LegalLibraryModal,{
      categories: legalCategories,
      editingLaw,
      saving: savingLaw,
      onSave: handleSaveLaw,
      onClose: ()=>{ setShowLawModal(false); setEditingLaw(null); }
    }),

    // تأكيد حذف قانون
    confirmDeleteLaw && React.createElement('div',{
      className:"fixed inset-0 z-50 flex items-center justify-center px-4",
      style:{background:'rgba(0,0,0,0.7)',backdropFilter:'blur(4px)'}
    },
      React.createElement('div',{
        className:"w-full max-w-xs rounded-2xl p-5 space-y-4 text-center",
        style:{background:'#0d1a2e',border:'1px solid rgba(239,68,68,0.3)'}
      },
        React.createElement('div',{className:"w-14 h-14 rounded-2xl bg-red-500/15 flex items-center justify-center mx-auto"},
          React.createElement(I.Trash,{className:"w-7 h-7 text-red-400"})
        ),
        React.createElement('div',null,
          React.createElement('p',{className:"text-sm font-black text-white"},"حذف هذا القانون؟"),
          React.createElement('p',{className:"text-xs text-slate-500 mt-1"},`سيتم حذف "${confirmDeleteLaw.title}" وجميع مواده المستخرجة نهائياً`)
        ),
        React.createElement('div',{className:"grid grid-cols-2 gap-2"},
          React.createElement('button',{
            onClick:()=>setConfirmDeleteLaw(null),
            className:"py-2.5 rounded-xl text-xs font-black bg-white/8 text-slate-300 active:scale-95 transition-transform"
          },"إلغاء"),
          React.createElement('button',{
            onClick:()=>handleDeleteLaw(confirmDeleteLaw),
            disabled:savingLaw,
            className:"py-2.5 rounded-xl text-xs font-black bg-red-500 text-white active:scale-95 transition-transform disabled:opacity-50"
          },savingLaw?'جاري الحذف...':'حذف نهائي')
        )
      )
    ),

    // تأكيد تسجيل الخروج من الأجهزة
    confirmSignOut && React.createElement('div',{
      className:"fixed inset-0 z-50 flex items-center justify-center px-4",
      style:{background:'rgba(0,0,0,0.75)',backdropFilter:'blur(4px)'}
    },
      React.createElement('div',{
        className:"w-full max-w-xs rounded-2xl p-5 space-y-4 text-center",
        style:{background:'#0d1a2e',border:'1px solid rgba(244,63,94,0.3)'}
      },
        React.createElement('div',{className:"w-14 h-14 rounded-2xl bg-[#C9A84C]/15 flex items-center justify-center mx-auto"},
          React.createElement(IconDevices,{className:"w-7 h-7 text-[#C9A84C]"})
        ),
        React.createElement('div',null,
          React.createElement('p',{className:"text-sm font-black text-white"},"تسجيل خروج من جميع الأجهزة؟"),
          React.createElement('p',{className:"text-xs text-slate-500 mt-1"},
            "سيتم إنهاء جميع جلسات "+confirmSignOut.full_name+" على كل الأجهزة فوراً")
        ),
        React.createElement('div',{className:"grid grid-cols-2 gap-2"},
          React.createElement('button',{
            onClick:()=>setConfirmSignOut(null),
            className:"py-2.5 rounded-xl text-xs font-black bg-white/8 text-slate-300 active:scale-95 transition-transform"
          },"إلغاء"),
          React.createElement('button',{
            onClick:()=>handleSignOutAllDevices(confirmSignOut),
            disabled:saving,
            className:"py-2.5 rounded-xl text-xs font-black bg-red-500 text-white active:scale-95 transition-transform disabled:opacity-50"
          },saving?'جاري...':'تسجيل خروج')
        )
      )
    ),

    // تأكيد قفل/فتح الحساب
    confirmLock && React.createElement('div',{
      className:"fixed inset-0 z-50 flex items-center justify-center px-4",
      style:{background:'rgba(0,0,0,0.75)',backdropFilter:'blur(4px)'}
    },
      React.createElement('div',{
        className:"w-full max-w-xs rounded-2xl p-5 space-y-4 text-center",
        style:{background:'#0d1a2e',border:`1px solid ${confirmLock.is_locked?'rgba(34,197,94,0.3)':'rgba(239,68,68,0.3)'}`}
      },
        React.createElement('div',{
          className:`w-14 h-14 rounded-2xl flex items-center justify-center mx-auto ${confirmLock.is_locked?'bg-[#C9A84C]/15':'bg-red-500/15'}`
        },
          React.createElement(IconLockSm,{className:`w-7 h-7 ${confirmLock.is_locked?'text-[#C9A84C]':'text-red-400'}`})
        ),
        React.createElement('div',null,
          React.createElement('p',{className:"text-sm font-black text-white"},
            confirmLock.is_locked?"فتح حساب "+confirmLock.full_name+"؟":"قفل حساب "+confirmLock.full_name+"؟"),
          React.createElement('p',{className:"text-xs text-slate-500 mt-1"},
            confirmLock.is_locked
              ?"سيتمكن المستخدم من تسجيل الدخول مجدداً"
              :"لن يستطيع المستخدم تسجيل الدخول حتى يُفتح حسابه")
        ),
        React.createElement('div',{className:"grid grid-cols-2 gap-2"},
          React.createElement('button',{
            onClick:()=>setConfirmLock(null),
            className:"py-2.5 rounded-xl text-xs font-black bg-white/8 text-slate-300 active:scale-95 transition-transform"
          },"إلغاء"),
          React.createElement('button',{
            onClick:()=>handleToggleLock(confirmLock),
            disabled:saving,
            className:`py-2.5 rounded-xl text-xs font-black text-white active:scale-95 transition-transform disabled:opacity-50 ${confirmLock.is_locked?'bg-[#C9A84C]':'bg-red-500'}`
          },saving?'جاري...':(confirmLock.is_locked?'فتح الحساب':'قفل الحساب'))
        )
      )
    ),

    // تأكيد الاستعادة
    confirmRestore && React.createElement('div',{
      className:"fixed inset-0 z-50 flex items-center justify-center px-4",
      style:{background:'rgba(0,0,0,0.8)',backdropFilter:'blur(4px)'}
    },
      React.createElement('div',{
        className:"w-full max-w-xs rounded-2xl p-5 space-y-4",
        style:{background:'#0d1a2e',border:'1px solid rgba(245,158,11,0.3)'}
      },
        // أيقونة
        React.createElement('div',{className:"text-center space-y-2"},
          React.createElement('div',{className:"w-14 h-14 rounded-2xl bg-[#C9A84C]/15 flex items-center justify-center mx-auto text-2xl"},"🔄"),
          React.createElement('p',{className:"text-sm font-black text-white"},"استعادة النسخة الاحتياطية؟"),
          React.createElement('p',{className:"text-xs text-slate-500"},
            new Date(confirmRestore.created_at).toLocaleDateString('ar-EG',{year:'numeric',month:'long',day:'numeric'}))
        ),

        // تحذير
        React.createElement('div',{className:"p-3 rounded-xl bg-red-500/10 border border-red-500/20 space-y-1"},
          React.createElement('p',{className:"text-[10px] font-black text-red-400"},"⚠️ تحذير مهم"),
          React.createElement('p',{className:"text-[9px] text-slate-400 leading-relaxed"},
            "ستُستبدل البيانات الحالية بالنسخة المحددة. هذه العملية لا يمكن التراجع عنها. يُنصح بإنشاء نسخة احتياطية جديدة أولاً.")
        ),

        // حقل التأكيد المزدوج — اكتب "استعادة" للمتابعة
        React.createElement('div',{className:"space-y-1"},
          React.createElement('p',{className:"text-[9px] text-slate-400 text-center"},
            'اكتب ',React.createElement('span',{className:"text-red-400 font-black"},'"استعادة"'),' للتأكيد:'
          ),
          React.createElement('input',{
            type:'text', value:restoreConfirmText,
            onChange:e=>setRestoreConfirmText(e.target.value),
            placeholder:'استعادة',
            className:'w-full p-2 text-center text-xs rounded-xl border border-red-500/30 bg-red-500/5 text-white placeholder-slate-600',
            style:{fontFamily:'Cairo,sans-serif'}
          })
        ),

        // معلومات النسخة
        confirmRestore.rows_count && React.createElement('div',{className:"flex justify-between text-[10px] text-slate-500 px-1"},
          React.createElement('span',null, (confirmRestore.rows_count).toLocaleString('ar-EG')+" سجل"),
          React.createElement('span',null, confirmRestore.size_kb+" KB"),
          React.createElement('span',null, "بواسطة: "+(confirmRestore.created_by_name||'—'))
        ),

        // أزرار
        React.createElement('div',{className:"grid grid-cols-2 gap-2"},
          React.createElement('button',{
            onClick:()=>{ setConfirmRestore(null); setRestoreConfirmText(''); },
            className:"py-2.5 rounded-xl text-xs font-black bg-white/8 text-slate-300 active:scale-95 transition-transform"
          },"إلغاء"),
          React.createElement('button',{
            onClick:()=>handleRestoreBackup(confirmRestore),
            disabled:restoringBackup||restoreConfirmText.trim()!=='استعادة',
            className:"py-2.5 rounded-xl text-xs font-black bg-[#C9A84C] text-white active:scale-95 transition-transform disabled:opacity-50 flex items-center justify-center gap-1"
          },
            restoringBackup ? React.createElement(React.Fragment,null, React.createElement(I.Spin), "جاري الاستعادة...")
                            : "استعادة الآن"
          )
        )
      )
    ),

    // تأكيد إنهاء جميع الجلسات
    confirmTerminateAll && React.createElement('div',{
      className:"fixed inset-0 z-50 flex items-center justify-center px-4",
      style:{background:'rgba(0,0,0,0.80)',backdropFilter:'blur(4px)'}
    },
      React.createElement('div',{
        className:"w-full max-w-xs rounded-2xl p-5 space-y-4 text-center",
        style:{background:'#0d1a2e',border:'1px solid rgba(239,68,68,0.35)'}
      },
        React.createElement('div',{className:"w-14 h-14 rounded-2xl bg-[#C9A84C]/15 flex items-center justify-center mx-auto text-2xl"},"⛔"),
        React.createElement('div',null,
          React.createElement('p',{className:"text-sm font-black text-white"},"إنهاء جميع الجلسات؟"),
          React.createElement('p',{className:"text-xs text-slate-500 mt-1 leading-relaxed"},
            "سيتم فصل جميع المستخدمين (",
            activeSessions.filter(s=>s.profileId!==profile?.id).length,
            " مستخدم) وإجبارهم على تسجيل الدخول مجدداً. جلستك الحالية لن تتأثر."
          )
        ),
        React.createElement('div',{className:"grid grid-cols-2 gap-2"},
          React.createElement('button',{
            onClick:()=>setConfirmTerminateAll(false),
            className:"py-2.5 rounded-xl text-xs font-black bg-white/8 text-slate-300 active:scale-95 transition-transform"
          },"إلغاء"),
          React.createElement('button',{
            onClick:handleTerminateAllSessions,
            disabled:terminatingAll,
            className:"py-2.5 rounded-xl text-xs font-black bg-red-500 text-white active:scale-95 transition-transform disabled:opacity-50 flex items-center justify-center gap-1"
          }, terminatingAll
            ? React.createElement(React.Fragment,null, React.createElement(I.Spin), "جاري الإنهاء...")
            : "إنهاء الكل الآن"
          )
        )
      )
    ),
      ) // end scroll div
    ), // end overlay


    // تأكيد الحذف
    confirmDelete && React.createElement('div',{
      className:"fixed inset-0 z-50 flex items-center justify-center px-4",
      style:{background:'rgba(0,0,0,0.7)',backdropFilter:'blur(4px)'}
    },
      React.createElement('div',{
        className:"w-full max-w-xs rounded-2xl p-5 space-y-4 text-center",
        style:{background:'#0d1a2e',border:'1px solid rgba(239,68,68,0.3)'}
      },
        React.createElement('div',{className:"w-14 h-14 rounded-2xl bg-red-500/15 flex items-center justify-center mx-auto"},
          React.createElement(I.Trash,{className:"w-7 h-7 text-red-400"})
        ),
        React.createElement('div',null,
          React.createElement('p',{className:"text-sm font-black text-white"},"حذف المستخدم؟"),
          React.createElement('p',{className:"text-xs text-slate-500 mt-1"},"سيتم حذف "+confirmDelete.full_name+" نهائياً")
        ),
        React.createElement('div',{className:"grid grid-cols-2 gap-2"},
          React.createElement('button',{
            onClick:()=>setConfirmDelete(null),
            className:"py-2.5 rounded-xl text-xs font-black bg-white/8 text-slate-300 active:scale-95 transition-transform"
          },"إلغاء"),
          React.createElement('button',{
            onClick:()=>handleDeleteUser(confirmDelete),
            disabled:saving,
            className:"py-2.5 rounded-xl text-xs font-black bg-red-500 text-white active:scale-95 transition-transform disabled:opacity-50"
          },saving?'جاري الحذف...':'حذف نهائي')
        )
      )
    )
  ); // Fragment
}
