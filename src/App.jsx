import React, { useState, useMemo, useEffect } from 'react';
import { differenceInMonths } from 'date-fns';
import { Users, AlertCircle, Trash2, X, Check, Info, DollarSign, TrendingUp, TrendingDown, Receipt, Camera, Image as ImageIcon, Filter, Printer, Sparkles, Wand2, UserCheck, RefreshCw, ThumbsUp, DownloadCloud, BookOpen, Calendar, ChevronDown, ChevronUp } from 'lucide-react';
import { collection, onSnapshot, addDoc, deleteDoc, doc, updateDoc, setDoc } from 'firebase/firestore';
import imageCompression from 'browser-image-compression';
import { GoogleGenerativeAI } from '@google/generative-ai';
import ReactMarkdown from 'react-markdown';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import { db } from './firebase';

const genAI = new GoogleGenerativeAI(import.meta.env.VITE_GEMINI_API_KEY);

const convertToBase64 = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader(); reader.readAsDataURL(file);
  reader.onload = () => resolve(reader.result); reader.onerror = error => reject(error);
});

const CustomModal = ({ isOpen, type, title, message, onConfirm, onCancel }) => {
  if (!isOpen) return null;
  const isConfirm = type === 'confirm';
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-stone-900/40 backdrop-blur-sm print:hidden">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden animate-in zoom-in-95 duration-200">
        <div className={`p-6 flex flex-col items-center text-center border-b-4 ${isConfirm ? 'border-amber-500' : 'border-emerald-500'}`}>
          <div className={`p-3 rounded-full mb-4 ${isConfirm ? 'bg-amber-100 text-amber-600' : 'bg-emerald-100 text-emerald-600'}`}>
            {isConfirm ? <AlertCircle size={32} /> : <Info size={32} />}
          </div>
          <h3 className="text-xl font-black text-stone-800 mb-2">{title}</h3>
          <p className="text-stone-500 font-medium leading-relaxed">{message}</p>
        </div>
        <div className="p-4 bg-stone-50 flex gap-3 justify-center">
          {isConfirm && <button onClick={onCancel} className="flex-1 py-3 px-4 rounded-xl font-bold text-stone-600 bg-white border border-stone-200 hover:bg-stone-100">Cancel</button>}
          <button onClick={onConfirm} className={`flex-1 py-3 px-4 rounded-xl font-bold text-white shadow-sm flex justify-center items-center gap-2 ${isConfirm ? 'bg-red-500 hover:bg-red-600' : 'bg-emerald-600 hover:bg-emerald-700'}`}>
            {isConfirm ? <Trash2 size={18} /> : <Check size={18} />} {isConfirm ? 'Delete' : 'Got it'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default function App() {
  const [activeTab, setActiveTab] = useState('ai'); // 默认停在 AI 模块方便测试
  const [children, setChildren] = useState([]); 
  const [newName, setNewName] = useState('');
  const [newDob, setNewDob] = useState('');
  const [newGender, setNewGender] = useState('Boy');

  const [transactions, setTransactions] = useState([]);
  const [txDate, setTxDate] = useState(new Date().toISOString().split('T')[0]);
  const [txType, setTxType] = useState('income');
  const [txCategory, setTxCategory] = useState('Agent Income');
  const [txDesc, setTxDesc] = useState('');
  const [txAmount, setTxAmount] = useState('');
  const [receiptImage, setReceiptImage] = useState(null);
  const [isCompressing, setIsCompressing] = useState(false);
  
  const [modal, setModal] = useState({ isOpen: false, type: 'alert', title: '', message: '', onConfirm: null });
  const [viewImage, setViewImage] = useState(null); 

  const [reportOpen, setReportOpen] = useState(false);
  const [filterType, setFilterType] = useState('all'); 
  const [filterPeriod, setFilterPeriod] = useState('thisMonth'); 
  const [filterStart, setFilterStart] = useState('');
  const [filterEnd, setFilterEnd] = useState('');
  const [filterCategory, setFilterCategory] = useState('all');

  // AI 状态
  const [isGenerating, setIsGenerating] = useState(false);
  const [aiOutput, setAiOutput] = useState('');
  const [planStatus, setPlanStatus] = useState('idle'); 
  
  // 🌟 新增：历史教案存档状态
  const [savedPlans, setSavedPlans] = useState([]);
  const [expandedPlanId, setExpandedPlanId] = useState(null);

  const showModal = (type, title, message, onConfirm = null) => {
    setModal({ isOpen: true, type, title, message, onConfirm: () => { if (onConfirm) onConfirm(); setModal({ ...modal, isOpen: false }); }, onCancel: () => setModal({ ...modal, isOpen: false }) });
  };

  useEffect(() => {
    // 监听名单
    const unsubC = onSnapshot(collection(db, 'dayhome_children'), (snap) => setChildren(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
    // 监听财务
    const unsubF = onSnapshot(collection(db, 'dayhome_finance'), (snap) => {
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      data.sort((a, b) => new Date(b.date) - new Date(a.date));
      setTransactions(data);
    });
    // 🌟 监听历史教案
    const unsubA = onSnapshot(collection(db, 'dayhome_activities'), (snap) => {
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      // 按日期倒序排列，最新的在最上面
      data.sort((a, b) => new Date(b.date) - new Date(a.date));
      setSavedPlans(data);
    });

    return () => { unsubC(); unsubF(); unsubA(); };
  }, []);

  const rosterStats = useMemo(() => {
    let under2Count = 0; let under3Count = 0;
    const enrichedChildren = children.map(child => {
      const months = differenceInMonths(new Date(), new Date(child.dob));
      if (months < 24) under2Count++; if (months < 36) under3Count++;
      const isPresent = child.isPresent !== false; 
      return { ...child, ageStr: `${Math.floor(months / 12)} Y, ${months % 12} M`, isUnder2: months < 24, isUnder3: months < 36, isPresent };
    });
    const presentChildren = enrichedChildren.filter(c => c.isPresent);
    return { list: enrichedChildren, presentChildren, totalCount: children.length, presentCount: presentChildren.length, under2Count, under3Count, totalWarning: children.length >= 6, totalError: children.length > 6 };
  }, [children]);

  const financeStats = useMemo(() => {
    let totalIncome = 0; let totalExpense = 0;
    transactions.forEach(tx => { if (tx.type === 'income') totalIncome += parseFloat(tx.amount); if (tx.type === 'expense') totalExpense += parseFloat(tx.amount); });
    return { totalIncome, totalExpense, netBalance: totalIncome - totalExpense };
  }, [transactions]);

  const generatedReport = useMemo(() => {
    let filtered = transactions;
    if (filterType !== 'all') filtered = filtered.filter(tx => tx.type === filterType);
    if (filterCategory !== 'all') filtered = filtered.filter(tx => tx.category === filterCategory);
    const today = new Date();
    const currentMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
    const currentYear = `${today.getFullYear()}`;
    if (filterPeriod === 'thisMonth') filtered = filtered.filter(tx => tx.date.startsWith(currentMonth));
    else if (filterPeriod === 'thisYear') filtered = filtered.filter(tx => tx.date.startsWith(currentYear));
    else if (filterPeriod === 'custom' && filterStart && filterEnd) filtered = filtered.filter(tx => tx.date >= filterStart && tx.date <= filterEnd);
    let sumInc = 0; let sumExp = 0;
    filtered.forEach(tx => { if (tx.type === 'income') sumInc += parseFloat(tx.amount); else sumExp += parseFloat(tx.amount); });
    return { list: filtered, sumInc, sumExp, net: sumInc - sumExp };
  }, [transactions, filterType, filterPeriod, filterStart, filterEnd, filterCategory]);

  const handleAddChild = async (e) => {
    e.preventDefault();
    if (!newName || !newDob) return;
    try { await addDoc(collection(db, 'dayhome_children'), { name: newName, dob: newDob, gender: newGender, isPresent: true }); setNewName(''); setNewDob(''); showModal('alert', 'Success!', `${newName} enrolled.`); } catch (e) { showModal('alert', 'Error', 'Failed to save.'); }
  };

  const handleRemoveChildClick = (id, name) => showModal('confirm', 'Remove Child', `Remove ${name}?`, async () => await deleteDoc(doc(db, 'dayhome_children', id)));
  const toggleAttendance = async (id, currentStatus) => { try { await updateDoc(doc(db, 'dayhome_children', id), { isPresent: !currentStatus }); } catch (e) { console.error("Error updating attendance:", e); } };

  const handleImageUpload = async (e) => {
    const file = e.target.files[0]; if (!file) return; setIsCompressing(true);
    try { const compressedFile = await imageCompression(file, { maxSizeMB: 0.1, maxWidthOrHeight: 800, useWebWorker: true }); setReceiptImage(await convertToBase64(compressedFile)); } catch (e) { showModal('alert', 'Error', 'Failed to compress image.'); } finally { setIsCompressing(false); }
  };
  const handleAddTransaction = async (e) => {
    e.preventDefault();
    if (!txAmount || isNaN(txAmount)) return showModal('alert', 'Invalid Input', 'Valid amount required.');
    try { await addDoc(collection(db, 'dayhome_finance'), { date: txDate, type: txType, category: txCategory, description: txDesc || txCategory, amount: parseFloat(txAmount), receiptImage: txType === 'expense' ? receiptImage : null }); setTxDesc(''); setTxAmount(''); setReceiptImage(null); showModal('alert', 'Saved!', 'Transaction recorded.'); } catch (e) { showModal('alert', 'Error', 'Failed to save.'); }
  };
  const handleRemoveTransaction = (id, desc) => showModal('confirm', 'Delete', `Delete "${desc}"?`, async () => await deleteDoc(doc(db, 'dayhome_finance', id)));

  const incomeCategories = ['Agent Income', 'Private Parent Fee', 'Government Subsidy', 'Other Income'];
  const expenseCategories = ['Food & Beverages (Meals)', 'Toys, Games & Crafts', 'Supplies & Office', 'Maintenance & Repairs', 'Utilities (Heat/Water/Light)', 'Insurance', 'Vehicle / Mileage', 'Other Expenses'];
  const activeCategories = filterType === 'income' ? incomeCategories : filterType === 'expense' ? expenseCategories : [...incomeCategories, ...expenseCategories];

  const handleExportArchive = async () => {
    try {
      const zip = new JSZip();
      let csvContent = "Date,Type,CRA_Category,Description,Amount,Receipt_File_Name\n"; 
      const folder = zip.folder("Receipts_Archive"); 

      generatedReport.list.forEach((tx, index) => {
        let fileName = "No_Receipt_Attached";
        if (tx.receiptImage) {
          const cleanDesc = (tx.description || tx.category).replace(/[^a-zA-Z0-9]/g, '_').substring(0, 15);
          fileName = `${tx.date}_${cleanDesc}_ID${index}.jpg`; 
          const base64Data = tx.receiptImage.split(',')[1]; 
          if (base64Data) folder.file(fileName, base64Data, {base64: true});
        }
        const amountStr = tx.type === 'income' ? `+${tx.amount}` : `-${tx.amount}`;
        const descCsv = `"${tx.description || ''}"`; 
        const catCsv = `"${tx.category}"`;
        csvContent += `${tx.date},${tx.type},${catCsv},${descCsv},${amountStr},${fileName}\n`;
      });
      zip.file(`Financial_Ledger_${filterPeriod}.csv`, csvContent);
      const content = await zip.generateAsync({type:"blob"});
      saveAs(content, `LearningTree_Archive_${filterPeriod}.zip`);
    } catch (error) { showModal('alert', 'Export Error', 'Failed to generate archive.'); }
  };

  const generateActivityPlan = async () => {
    if (rosterStats.presentChildren.length === 0) return showModal('alert', 'No Attendance', 'No children are marked as present today. Please update the roster first!');
    setPlanStatus('drafting'); setAiOutput('');
    try {
      const childrenContext = rosterStats.presentChildren.map(c => `${c.name} (${c.gender || 'Child'}, Age: ${c.ageStr})`).join(', ');
      const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
      const prompt = `You are an expert Early Childhood Educator in Alberta, Canada.\nToday's present children are: ${childrenContext}.\nGenerate a daily activity plan with exactly 2 engaging activities tailored to the specific genders and ages of these children.\nCrucially, you MUST align these activities with the "Flight: Alberta’s Early Learning and Care Framework".\nFor each activity, provide:\n1. **Activity Title**\n2. **Flight Framework Connection**\n3. **Materials Needed**\n4. **Age/Gender Adaptation**\nKeep it practical and format it beautifully in Markdown. Do not include introductory filler.`;
      const result = await model.generateContent(prompt);
      setAiOutput((await result.response).text());
      setPlanStatus('reviewing');
    } catch (error) { setAiOutput(`**Error generating plan.**\nDetails: ${error.message}`); setPlanStatus('idle'); }
  };

  // 🌟 核心修改：将通过审核的教案存入云端
  const acceptPlan = async () => {
    try {
      // 获取本地格式的年月日作为唯一 ID，例如 "2026-03-01"
      // 使用 localDateString 可以避免 UTC 时区带来的昨天/明天漂移问题
      const todayStr = new Date().toLocaleDateString('en-CA'); 
      
      // 使用 setDoc，以日期作为文档 ID。如果今天已经生成过，就会直接覆盖更新。
      await setDoc(doc(db, 'dayhome_activities', todayStr), {
        date: todayStr,
        plan: aiOutput,
        attendanceCount: rosterStats.presentCount,
        timestamp: new Date().toISOString()
      });
      
      setPlanStatus('accepted'); 
      showModal('alert', 'Plan Saved!', `Today's activity plan (${todayStr}) has been locked and securely archived.`);
    } catch (error) {
      console.error("Error saving plan:", error);
      showModal('alert', 'Error', 'Failed to securely save the plan to the archive.');
    }
  };

  // 🌟 删除历史教案
  const handleDeleteArchivedPlan = (id, date) => {
    showModal('confirm', 'Delete Plan', `Are you sure you want to delete the plan for ${date}?`, async () => {
      await deleteDoc(doc(db, 'dayhome_activities', id));
    });
  };

  return (
    <div className="min-h-screen bg-stone-50 font-sans text-stone-800 pb-12 relative">
      <CustomModal {...modal} />

      {viewImage && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-stone-900/90 backdrop-blur-md print:hidden" onClick={() => setViewImage(null)}>
          <div className="relative max-w-4xl w-full flex justify-center items-center">
            <button className="absolute -top-12 right-0 md:top-4 md:right-4 bg-stone-800/50 text-white rounded-full p-2 hover:bg-stone-700 transition-colors z-50"><X size={28}/></button>
            <img src={viewImage} className="max-w-full max-h-[85vh] object-contain rounded-xl shadow-2xl ring-4 ring-white/10" onClick={e => e.stopPropagation()} />
          </div>
        </div>
      )}

      {reportOpen && (
        <div className="fixed inset-0 z-50 bg-stone-100 overflow-y-auto">
          {/* ... 报表代码保持不变 ... */}
          <div className="max-w-4xl mx-auto p-4 md:p-8 min-h-screen bg-white shadow-2xl">
            <div className="print:hidden mb-8 space-y-4 bg-stone-50 p-6 rounded-3xl border border-stone-200">
              <div className="flex justify-between items-center mb-4"><h2 className="text-xl font-black text-stone-800 flex items-center gap-2"><Filter size={24} className="text-emerald-600"/> Report Filter & Export</h2><button onClick={() => setReportOpen(false)} className="p-2 bg-stone-200 text-stone-600 rounded-full hover:bg-stone-300"><X size={20}/></button></div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div><label className="block text-xs font-bold text-stone-500 uppercase mb-1">Transaction Type</label><select value={filterType} onChange={e => { setFilterType(e.target.value); setFilterCategory('all'); }} className="w-full p-3 rounded-xl border border-stone-200"><option value="all">All Transactions</option><option value="income">Income Only</option><option value="expense">Expense Only</option></select></div>
                <div><label className="block text-xs font-bold text-stone-500 uppercase mb-1">Time Period</label><select value={filterPeriod} onChange={e => setFilterPeriod(e.target.value)} className="w-full p-3 rounded-xl border border-stone-200"><option value="thisMonth">This Month</option><option value="thisYear">This Year</option><option value="all">All Time</option><option value="custom">Custom Range</option></select></div>
                <div><label className="block text-xs font-bold text-stone-500 uppercase mb-1">CRA Category</label><select value={filterCategory} onChange={e => setFilterCategory(e.target.value)} className="w-full p-3 rounded-xl border border-stone-200"><option value="all">All Categories</option>{activeCategories.map(c => <option key={c} value={c}>{c}</option>)}</select></div>
                {filterPeriod === 'custom' && (<div className="md:col-span-3 flex gap-4"><div className="flex-1"><label className="block text-xs font-bold text-stone-500 uppercase mb-1">Start Date</label><input type="date" value={filterStart} onChange={e=>setFilterStart(e.target.value)} className="w-full p-3 rounded-xl border border-stone-200" /></div><div className="flex-1"><label className="block text-xs font-bold text-stone-500 uppercase mb-1">End Date</label><input type="date" value={filterEnd} onChange={e=>setFilterEnd(e.target.value)} className="w-full p-3 rounded-xl border border-stone-200" /></div></div>)}
              </div>
              <div className="flex flex-col sm:flex-row gap-4 mt-6">
                <button onClick={() => window.print()} className="flex-1 bg-stone-200 text-stone-700 font-bold py-3 px-4 rounded-xl flex items-center justify-center gap-2 hover:bg-stone-300 transition-colors"><Printer size={20}/> Print View / PDF</button>
                <button onClick={handleExportArchive} className="flex-2 bg-indigo-600 text-white font-bold py-3 px-4 rounded-xl flex items-center justify-center gap-2 hover:bg-indigo-700 shadow-md transition-all"><DownloadCloud size={20}/> Export Archive (CSV + Photos)</button>
              </div>
            </div>
            <div className="print:block" id="printable-report">
              <div className="text-center mb-8 border-b-4 border-stone-800 pb-6"><h1 className="text-3xl font-black text-stone-800 uppercase tracking-widest mb-2">Financial Report</h1><h2 className="text-xl font-bold text-stone-500">LearningTree Dayhome</h2><p className="text-sm font-medium mt-2 text-stone-400">{filterPeriod === 'thisMonth' ? 'Current Month' : filterPeriod === 'thisYear' ? 'Current Year' : filterPeriod === 'custom' ? `${filterStart || 'Start'} to ${filterEnd || 'End'}` : 'All Time Record'}</p></div>
              <div className="flex justify-between items-center mb-8 p-6 bg-stone-100 rounded-3xl print:bg-stone-100">
                <div className="text-center"><p className="text-sm font-bold text-stone-500 uppercase">Total Income</p><p className="text-2xl font-black text-emerald-600">${generatedReport.sumInc.toFixed(2)}</p></div><div className="text-center"><p className="text-sm font-bold text-stone-500 uppercase">Total Expenses</p><p className="text-2xl font-black text-red-600">${generatedReport.sumExp.toFixed(2)}</p></div><div className="text-center"><p className="text-sm font-bold text-stone-500 uppercase">Net Balance</p><p className="text-2xl font-black text-stone-800">${generatedReport.net.toFixed(2)}</p></div>
              </div>
              <table className="w-full text-left border-collapse">
                <thead><tr className="border-b-2 border-stone-300 text-stone-500 text-sm"><th className="py-3 px-2">Date</th><th className="py-3 px-2">Description</th><th className="py-3 px-2">CRA Category</th><th className="py-3 px-2 text-right">Amount</th></tr></thead>
                <tbody className="divide-y divide-stone-200">
                  {generatedReport.list.length === 0 ? <tr><td colSpan="4" className="py-8 text-center text-stone-400">No records match this filter.</td></tr> :
                    generatedReport.list.map(tx => (
                      <tr key={tx.id} className="text-sm font-medium text-stone-700"><td className="py-4 px-2">{tx.date}</td><td className="py-4 px-2 font-bold">{tx.description}</td><td className="py-4 px-2 text-xs text-stone-500">{tx.category}</td><td className={`py-4 px-2 text-right font-black ${tx.type === 'income' ? 'text-emerald-600' : 'text-stone-800'}`}>{tx.type === 'income' ? '+' : '-'}${parseFloat(tx.amount).toFixed(2)}</td></tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* 顶部导航 */}
      <header className="bg-white border-b-4 border-emerald-500 shadow-sm sticky top-0 z-10 print:hidden">
        <div className="max-w-5xl mx-auto px-4 pt-3 pb-2">
          <div className="flex items-center gap-3 mb-3">
            <img src="/logo_dayhome.png" alt="LearningTree Logo" className="h-10 w-auto drop-shadow-sm" />
            <div><h1 className="text-xl font-black text-amber-900 tracking-tight leading-tight">LearningTree</h1><p className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest">Dayhome Hub</p></div>
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
            <button onClick={() => setActiveTab('roster')} className={`px-4 py-2 rounded-lg font-bold text-sm whitespace-nowrap transition-all flex items-center gap-2 ${activeTab === 'roster' ? 'bg-stone-100 text-emerald-700' : 'text-stone-500 hover:text-stone-700'}`}><Users size={16} /> Roster</button>
            <button onClick={() => setActiveTab('finance')} className={`px-4 py-2 rounded-lg font-bold text-sm whitespace-nowrap transition-all flex items-center gap-2 ${activeTab === 'finance' ? 'bg-stone-100 text-emerald-700' : 'text-stone-500 hover:text-stone-700'}`}><DollarSign size={16} /> Finance</button>
            <button onClick={() => setActiveTab('ai')} className={`px-4 py-2 rounded-lg font-bold text-sm whitespace-nowrap transition-all flex items-center gap-2 ${activeTab === 'ai' ? 'bg-indigo-100 text-indigo-700 shadow-sm' : 'text-stone-500 hover:text-indigo-600'}`}><Sparkles size={16} /> AI Assistant</button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 mt-6 space-y-8 print:hidden">
        
        {/* ================= 模块一：人员名单 ================= */}
        {activeTab === 'roster' && (
           <div className="animate-in fade-in duration-300">
             <section className="mb-8"><div className="flex justify-between items-end mb-4"><h2 className="text-2xl font-extrabold text-stone-800">Attendance Radar</h2></div><div className="grid grid-cols-1 md:grid-cols-4 gap-4"><div className="p-5 rounded-2xl border-2 bg-emerald-50 border-emerald-200 text-center"><h3 className="text-sm font-bold uppercase text-emerald-800 opacity-80 mb-1">Present Today</h3><div className="text-3xl font-black text-emerald-600">{rosterStats.presentCount} <span className="text-lg opacity-60">/ {rosterStats.totalCount}</span></div></div><div className={`p-5 rounded-2xl border-2 text-center bg-white border-stone-200`}><h3 className="text-sm font-bold uppercase opacity-80 mb-1">Total Enrolled</h3><div className="text-3xl font-black">{rosterStats.totalCount} <span className="text-lg opacity-60">/ 6</span></div></div><div className={`p-5 rounded-2xl border-2 text-center bg-white border-stone-200`}><h3 className="text-sm font-bold uppercase opacity-80 mb-1">Under 3</h3><div className="text-3xl font-black">{rosterStats.under3Count} <span className="text-lg opacity-60">/ 3</span></div></div><div className={`p-5 rounded-2xl border-2 text-center bg-white border-stone-200`}><h3 className="text-sm font-bold uppercase opacity-80 mb-1">Under 2</h3><div className="text-3xl font-black">{rosterStats.under2Count} <span className="text-lg opacity-60">/ 2</span></div></div></div></section><div className="grid grid-cols-1 lg:grid-cols-3 gap-8"><section className="lg:col-span-2"><h2 className="text-xl font-extrabold text-stone-800 mb-4">Daily Check-in</h2><div className="bg-white rounded-3xl shadow-sm border border-stone-100 overflow-hidden divide-y divide-stone-100">{rosterStats.list.length === 0 ? <p className="p-8 text-center text-stone-400">No children enrolled.</p> : rosterStats.list.map(child => (<div key={child.id} className={`p-4 flex justify-between items-center transition-colors ${child.isPresent ? 'bg-white' : 'bg-stone-50 opacity-60'}`}><div className="flex items-center gap-4"><button onClick={() => toggleAttendance(child.id, child.isPresent)} className={`w-10 h-10 rounded-full flex items-center justify-center border-2 transition-all ${child.isPresent ? 'bg-emerald-500 border-emerald-500 text-white shadow-md' : 'bg-stone-100 border-stone-300 text-transparent hover:border-emerald-300'}`}><Check size={20} /></button><div><h4 className="font-bold text-stone-800 text-lg flex items-center gap-2">{child.name} <span className={`text-[10px] px-2 py-0.5 rounded-full uppercase font-bold ${child.gender === 'Girl' ? 'bg-pink-100 text-pink-600' : 'bg-blue-100 text-blue-600'}`}>{child.gender || 'Boy'}</span></h4><div className="text-sm text-stone-500 flex items-center gap-2 mt-0.5"><span>{child.ageStr}</span>{child.isUnder2 && <span className="bg-amber-100 text-amber-800 text-[10px] px-2 py-0.5 rounded-sm uppercase font-bold">Under 2</span>}</div></div></div><button onClick={() => handleRemoveChildClick(child.id, child.name)} className="text-stone-300 hover:text-red-500 p-2"><Trash2 size={20}/></button></div>))}</div></section><section><h2 className="text-xl font-extrabold text-stone-800 mb-4">Add Child</h2><form onSubmit={handleAddChild} className="bg-white p-6 rounded-3xl border border-stone-100 space-y-4 shadow-sm"><input type="text" value={newName} onChange={e=>setNewName(e.target.value)} placeholder="First Name" required className="w-full p-3 bg-stone-50 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none"/><div className="flex gap-2 p-1 bg-stone-100 rounded-xl"><button type="button" onClick={() => setNewGender('Boy')} className={`flex-1 py-2 rounded-lg font-bold text-sm ${newGender === 'Boy' ? 'bg-white text-blue-600 shadow-sm' : 'text-stone-500'}`}>Boy</button><button type="button" onClick={() => setNewGender('Girl')} className={`flex-1 py-2 rounded-lg font-bold text-sm ${newGender === 'Girl' ? 'bg-white text-pink-600 shadow-sm' : 'text-stone-500'}`}>Girl</button></div><input type="date" value={newDob} onChange={e=>setNewDob(e.target.value)} required className="w-full p-3 bg-stone-50 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none"/><button type="submit" className="w-full bg-emerald-600 text-white font-bold p-3 rounded-xl hover:bg-emerald-700">Enroll Child</button></form></section></div>
           </div>
        )}

        {/* ================= 模块二：财务管理 ================= */}
        {activeTab === 'finance' && (
          <div className="animate-in fade-in duration-300">
             <section className="mb-8">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="p-5 rounded-2xl border-2 border-emerald-100 bg-emerald-50 flex justify-between items-center"><div><h3 className="text-xs font-bold uppercase opacity-70 text-emerald-800 mb-1">Total Income</h3><div className="text-3xl font-black text-emerald-600">${financeStats.totalIncome.toFixed(2)}</div></div><TrendingUp size={32} className="text-emerald-400 opacity-50"/></div>
                <div className="p-5 rounded-2xl border-2 border-red-100 bg-red-50 flex justify-between items-center"><div><h3 className="text-xs font-bold uppercase opacity-70 text-red-800 mb-1">Deductible Expenses</h3><div className="text-3xl font-black text-red-600">${financeStats.totalExpense.toFixed(2)}</div></div><TrendingDown size={32} className="text-red-400 opacity-50"/></div>
                <div className="p-5 rounded-2xl border-2 border-blue-100 bg-blue-50 flex justify-between items-center"><div><h3 className="text-xs font-bold uppercase opacity-70 text-blue-800 mb-1">Net Profit</h3><div className="text-3xl font-black text-blue-600">${financeStats.netBalance.toFixed(2)}</div></div><DollarSign size={32} className="text-blue-400 opacity-50"/></div>
              </div>
            </section>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              <section>
                <form onSubmit={handleAddTransaction} className="bg-white p-6 rounded-3xl border border-stone-100 space-y-4 shadow-sm">
                  <div className="flex gap-2 p-1 bg-stone-100 rounded-xl"><button type="button" onClick={() => { setTxType('income'); setTxCategory('Agent Income'); setReceiptImage(null); }} className={`flex-1 py-2 rounded-lg font-bold text-sm ${txType === 'income' ? 'bg-white text-emerald-600 shadow-sm' : 'text-stone-500'}`}>Income</button><button type="button" onClick={() => { setTxType('expense'); setTxCategory('Food & Beverages (Meals)'); }} className={`flex-1 py-2 rounded-lg font-bold text-sm ${txType === 'expense' ? 'bg-white text-red-600 shadow-sm' : 'text-stone-500'}`}>Expense</button></div>
                  <input type="date" value={txDate} onChange={e=>setTxDate(e.target.value)} required className="w-full p-3 bg-stone-50 rounded-xl"/>
                  <select value={txCategory} onChange={e=>setTxCategory(e.target.value)} className="w-full p-3 bg-stone-50 rounded-xl">{(txType === 'income' ? incomeCategories : expenseCategories).map(c => <option key={c} value={c}>{c}</option>)}</select>
                  <input type="text" value={txDesc} onChange={e=>setTxDesc(e.target.value)} placeholder="Note (e.g. Costco)" className="w-full p-3 bg-stone-50 rounded-xl"/>
                  {txType === 'expense' && (<div className="flex items-center gap-3"><label className="flex-1 flex justify-center items-center gap-2 p-3 border-2 border-dashed border-stone-300 rounded-xl cursor-pointer text-stone-500 hover:bg-stone-50">{isCompressing ? "Compressing..." : <><Camera size={20}/><span className="font-bold text-sm">Snap Receipt</span></>}<input type="file" accept="image/*" capture="environment" className="hidden" onChange={handleImageUpload} disabled={isCompressing}/></label>{receiptImage && <div className="h-12 w-12 rounded-lg overflow-hidden relative border border-stone-200"><img src={receiptImage} className="w-full h-full object-cover"/><button type="button" onClick={()=>setReceiptImage(null)} className="absolute top-0 right-0 bg-red-500 text-white rounded-bl-lg p-0.5"><X size={12}/></button></div>}</div>)}
                  <input type="number" step="0.01" value={txAmount} onChange={e=>setTxAmount(e.target.value)} required placeholder="Amount ($)" className="w-full p-3 text-xl font-black bg-stone-50 rounded-xl"/>
                  <button type="submit" disabled={isCompressing} className={`w-full text-white font-bold p-3 rounded-xl ${txType === 'income' ? 'bg-emerald-600' : 'bg-red-500'}`}>Save Entry</button>
                </form>
              </section>
              <section className="lg:col-span-2">
                <div className="flex justify-between items-center mb-4"><h2 className="text-xl font-extrabold text-stone-800">Recent Transactions</h2><button onClick={() => setReportOpen(true)} className="flex items-center gap-2 text-sm font-bold bg-stone-800 text-white px-4 py-2 rounded-xl hover:bg-stone-700 shadow-md"><Receipt size={16}/> Generator</button></div>
                <div className="bg-white rounded-3xl border border-stone-100 divide-y divide-stone-100 shadow-sm">
                  {transactions.length === 0 ? <p className="p-8 text-center text-stone-400">No transactions.</p> : transactions.map(tx => (
                    <div key={tx.id} className="p-4 flex justify-between items-center hover:bg-stone-50 transition-colors">
                      <div className="flex gap-4 items-center">
                        <div className={`p-3 rounded-xl ${tx.type === 'income' ? 'bg-emerald-100 text-emerald-600' : 'bg-red-100 text-red-500'}`}>{tx.type === 'income' ? <TrendingUp size={20}/> : <TrendingDown size={20}/>}</div>
                        <div>
                          <div className="flex items-center gap-2 font-bold text-stone-800">
                            {tx.description} 
                            {tx.receiptImage && (
                              <button onClick={() => setViewImage(tx.receiptImage)} className="text-blue-500 bg-blue-50 p-1.5 rounded-lg hover:bg-blue-100 transition-colors" title="View Receipt"><ImageIcon size={16}/></button>
                            )}
                          </div>
                          <div className="text-xs text-stone-500 flex gap-2 mt-1"><span>{tx.date}</span><span className="bg-stone-100 px-2 py-0.5 rounded-full">{tx.category}</span></div>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <span className={`font-black text-lg ${tx.type === 'income' ? 'text-emerald-600' : 'text-stone-800'}`}>{tx.type === 'income' ? '+' : '-'}${parseFloat(tx.amount).toFixed(2)}</span>
                        <button onClick={()=>handleRemoveTransaction(tx.id, tx.description)} className="text-stone-300 hover:text-red-500"><Trash2 size={20}/></button>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            </div>
          </div>
        )}

        {/* ================= 模块三：AI 幼教大脑 ================= */}
        {activeTab === 'ai' && (
          <div className="animate-in fade-in duration-300 space-y-8">
            {/* AI 生成台 */}
            <section className="bg-indigo-600 text-white p-6 md:p-8 rounded-3xl shadow-lg relative overflow-hidden">
              <Sparkles size={120} className="absolute -top-10 -right-10 text-indigo-500 opacity-30" />
              <div className="relative z-10 max-w-2xl"><h2 className="text-2xl md:text-3xl font-black mb-2 flex items-center gap-3"><UserCheck size={28} /> Activity Planner</h2><div className="bg-indigo-800/50 p-4 rounded-xl mb-6 backdrop-blur-sm border border-indigo-500/30"><p className="text-sm font-bold text-indigo-200 uppercase tracking-widest mb-1">Today's Attendance:</p><p className="text-lg font-medium">{rosterStats.presentCount === 0 ? "No children checked in yet. Please go to Roster to mark attendance." : rosterStats.presentChildren.map(c => `${c.name} (${c.gender || 'Boy'}, ${c.ageStr})`).join(' • ')}</p></div><button onClick={generateActivityPlan} disabled={planStatus === 'drafting' || rosterStats.presentCount === 0} className="w-full sm:w-auto bg-white text-indigo-700 font-black py-4 px-8 rounded-2xl flex items-center justify-center gap-2 hover:bg-indigo-50 active:scale-95 transition-all shadow-md disabled:opacity-50"><Wand2 size={20} />{planStatus === 'drafting' ? 'Brainstorming...' : 'Generate Today\'s Flight Plan'}</button></div>
            </section>

            {/* 新生成的草稿 / 刚通过的审核预览区 */}
            {aiOutput && (
              <section className="bg-white p-6 md:p-8 rounded-3xl shadow-sm border border-stone-200 animate-in slide-in-from-bottom-4 duration-500">
                <div className="flex items-center justify-between mb-6 border-b border-stone-100 pb-4"><div className="flex items-center gap-3"><div className={`p-2 rounded-xl ${planStatus === 'accepted' ? 'bg-emerald-100 text-emerald-600' : 'bg-indigo-100 text-indigo-600'}`}>{planStatus === 'accepted' ? <Check size={24} /> : <Wand2 size={24} />}</div><h3 className="text-xl font-black text-stone-800">{planStatus === 'accepted' ? "Locked: Today's Activity Plan" : "Draft: Review Plan"}</h3></div>{planStatus === 'accepted' && (<span className="bg-emerald-500 text-white text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wider shadow-sm">Accepted</span>)}</div>
                <div className={`prose prose-stone prose-headings:font-black prose-h3:text-indigo-800 max-w-none text-stone-700 leading-relaxed transition-all ${planStatus === 'accepted' ? '' : 'opacity-90'}`}><ReactMarkdown>{aiOutput}</ReactMarkdown></div>
                {planStatus === 'reviewing' && (
                  <div className="mt-10 flex flex-col sm:flex-row gap-4 pt-6 border-t border-stone-100 bg-stone-50 p-4 rounded-2xl"><button onClick={generateActivityPlan} className="flex-1 flex items-center justify-center gap-2 py-4 px-6 rounded-xl font-bold text-stone-600 bg-white border-2 border-stone-200 hover:border-indigo-300 hover:text-indigo-600 transition-colors"><RefreshCw size={20} /> Not quite right, Regenerate</button><button onClick={acceptPlan} className="flex-1 flex items-center justify-center gap-2 py-4 px-6 rounded-xl font-bold text-white bg-emerald-600 hover:bg-emerald-700 shadow-md transition-colors"><ThumbsUp size={20} /> Perfect, Accept & Lock Plan</button></div>
                )}
              </section>
            )}

            {/* 🌟 新增：历史教案档案馆 */}
            {savedPlans.length > 0 && (
              <section className="mt-12 animate-in fade-in duration-500">
                <h3 className="text-xl font-extrabold text-stone-800 mb-6 flex items-center gap-2">
                  <BookOpen size={24} className="text-indigo-600" /> Activity Plan Archive
                </h3>
                <div className="space-y-4">
                  {savedPlans.map(plan => (
                    <div key={plan.id} className="bg-white rounded-2xl border border-stone-200 overflow-hidden shadow-sm hover:shadow-md transition-shadow">
                      <div 
                        className="p-5 flex justify-between items-center cursor-pointer hover:bg-stone-50 transition-colors"
                        onClick={() => setExpandedPlanId(expandedPlanId === plan.id ? null : plan.id)}
                      >
                        <div className="font-bold text-stone-800 text-lg flex items-center gap-3">
                          <Calendar size={20} className="text-indigo-500"/> 
                          {plan.date} 
                          {/* 提示：如果是今天的，给个小小的 TODAY 标签 */}
                          {plan.date === new Date().toLocaleDateString('en-CA') && <span className="bg-amber-100 text-amber-700 text-[10px] px-2 py-0.5 rounded-full uppercase tracking-wider">Today</span>}
                        </div>
                        <div className="text-sm font-medium text-stone-500 flex items-center gap-4">
                          <span className="hidden sm:inline-block bg-stone-100 px-3 py-1 rounded-full">{plan.attendanceCount} children present</span>
                          {expandedPlanId === plan.id ? <ChevronUp size={20}/> : <ChevronDown size={20}/>}
                        </div>
                      </div>
                      
                      {/* 下拉展开的内容 */}
                      {expandedPlanId === plan.id && (
                        <div className="p-6 bg-stone-50 border-t border-stone-100 relative">
                          <div className="prose prose-stone prose-sm max-w-none text-stone-700">
                             <ReactMarkdown>{plan.plan}</ReactMarkdown>
                          </div>
                          {/* 提供一个删除旧教案的功能，防止手滑或者想清理 */}
                          <button 
                            onClick={(e) => { e.stopPropagation(); handleDeleteArchivedPlan(plan.id, plan.date); }}
                            className="absolute top-6 right-6 text-stone-300 hover:text-red-500 p-2 bg-white rounded-full shadow-sm"
                            title="Delete this archived plan"
                          >
                            <Trash2 size={16}/>
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            )}

          </div>
        )}

      </main>
    </div>
  );
}