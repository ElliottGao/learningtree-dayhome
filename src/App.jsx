import React, { useState, useMemo, useEffect } from 'react';
import { differenceInMonths } from 'date-fns';
import { Baby, Users, AlertCircle, Plus, Trash2, X, Check, Info, DollarSign, TrendingUp, TrendingDown, Receipt, Camera, Image as ImageIcon, Filter, Printer, Sparkles, Wand2, MessageCircleHeart } from 'lucide-react';
import { collection, onSnapshot, addDoc, deleteDoc, doc } from 'firebase/firestore';
import imageCompression from 'browser-image-compression';
import { GoogleGenerativeAI } from '@google/generative-ai';
import ReactMarkdown from 'react-markdown';
import { db } from './firebase';

// 🌟 初始化 Gemini AI 大脑 (读取你配置在 .env 里的钥匙)
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
  const [activeTab, setActiveTab] = useState('ai'); // 默认先展示 AI 方便测试
  const [children, setChildren] = useState([]); 
  const [newName, setNewName] = useState('');
  const [newDob, setNewDob] = useState('');

  const [transactions, setTransactions] = useState([]);
  const [txDate, setTxDate] = useState(new Date().toISOString().split('T')[0]);
  const [txType, setTxType] = useState('income');
  const [txCategory, setTxCategory] = useState('Agent Income');
  const [txDesc, setTxDesc] = useState('');
  const [txAmount, setTxAmount] = useState('');
  const [receiptImage, setReceiptImage] = useState(null);
  const [isCompressing, setIsCompressing] = useState(false);
  const [modal, setModal] = useState({ isOpen: false, type: 'alert', title: '', message: '', onConfirm: null });

  // 报表状态
  const [reportOpen, setReportOpen] = useState(false);
  const [filterType, setFilterType] = useState('all'); 
  const [filterPeriod, setFilterPeriod] = useState('thisMonth'); 
  const [filterStart, setFilterStart] = useState('');
  const [filterEnd, setFilterEnd] = useState('');
  const [filterCategory, setFilterCategory] = useState('all');

  // --- 🤖 AI 状态 ---
  const [isGenerating, setIsGenerating] = useState(false);
  const [aiOutput, setAiOutput] = useState('');
  const [aiTaskType, setAiTaskType] = useState(''); // 'plan' or 'report'

  const showModal = (type, title, message, onConfirm = null) => {
    setModal({ isOpen: true, type, title, message, onConfirm: () => { if (onConfirm) onConfirm(); setModal({ ...modal, isOpen: false }); }, onCancel: () => setModal({ ...modal, isOpen: false }) });
  };

  useEffect(() => {
    const unsubC = onSnapshot(collection(db, 'dayhome_children'), (snap) => setChildren(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
    const unsubF = onSnapshot(collection(db, 'dayhome_finance'), (snap) => {
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      data.sort((a, b) => new Date(b.date) - new Date(a.date));
      setTransactions(data);
    });
    return () => { unsubC(); unsubF(); };
  }, []);

  const rosterStats = useMemo(() => {
    let under2Count = 0; let under3Count = 0;
    const enrichedChildren = children.map(child => {
      const months = differenceInMonths(new Date(), new Date(child.dob));
      if (months < 24) under2Count++; if (months < 36) under3Count++;
      return { ...child, ageStr: `${Math.floor(months / 12)} Y, ${months % 12} M`, isUnder2: months < 24, isUnder3: months < 36 };
    });
    return { list: enrichedChildren, totalCount: children.length, under2Count, under3Count, totalWarning: children.length >= 6, totalError: children.length > 6 };
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
    try { await addDoc(collection(db, 'dayhome_children'), { name: newName, dob: newDob }); setNewName(''); setNewDob(''); showModal('alert', 'Success!', `${newName} enrolled.`); } catch (e) { showModal('alert', 'Error', 'Failed to save.'); }
  };
  const handleRemoveChildClick = (id, name) => showModal('confirm', 'Remove Child', `Remove ${name}?`, async () => await deleteDoc(doc(db, 'dayhome_children', id)));
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

  // ================= 🤖 核心 AI 生成逻辑 =================
  const generateAIContent = async (type) => {
    if (rosterStats.list.length === 0) {
      showModal('alert', 'Empty Roster', 'Please add some children to the roster first so the AI knows who it is planning for!');
      return;
    }

    setIsGenerating(true);
    setAiOutput('');
    setAiTaskType(type);

    try {
      // 提取所有孩子的名字和年龄，给 AI 提供精准上下文
      const childrenContext = rosterStats.list.map(c => `${c.name} (Age: ${c.ageStr})`).join(', ');
      
      const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
      let prompt = "";

      if (type === 'plan') {
        prompt = `
          You are an expert Early Childhood Educator in Alberta, Canada.
          Today, you have the following children in your dayhome: ${childrenContext}.
          
          Generate a daily activity plan with exactly 2 engaging activities. 
          Crucially, you MUST align these activities with the "Flight: Alberta’s Early Learning and Care Framework".
          
          For each activity, please provide:
          1. **Activity Title** (Creative and fun)
          2. **Flight Framework Connection** (Which concept/goal from the Alberta Flight framework it targets)
          3. **Materials Needed** (Common dayhome items)
          4. **Age Adaptation** (Briefly explain how to adjust the activity so the older and younger children mentioned above can both participate safely and gainfully).
          
          Keep it highly practical, inspiring, and format it beautifully in Markdown. Do not include introductory or concluding conversational filler.
        `;
      } else if (type === 'report') {
        prompt = `
          You are a warm, professional dayhome educator. 
          The children present today are: ${childrenContext}.
          
          Write a daily recap message template that I can send to the parents. 
          Use placeholders like [Insert brief detail] where I need to fill in specific daily events.
          
          Include these sections:
          - **Today's Highlight**: A cheerful summary of our main activity.
          - **Meals & Naps**: A section to report on how they ate and slept.
          - **Gentle Reminders**: A space for any upcoming notices (e.g., please bring more diapers, upcoming holiday).
          
          Keep the tone loving, reassuring, and extremely professional. Use Markdown for formatting.
        `;
      }

      const result = await model.generateContent(prompt);
      const response = await result.response;
      setAiOutput(response.text());

    } catch (error) {
      console.error(error);
      setAiOutput(`**Error generating content.**\nPlease check your API key and network connection.\n\nDetails: ${error.message}`);
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="min-h-screen bg-stone-50 font-sans text-stone-800 pb-12 relative">
      <CustomModal {...modal} />

      {/* 报表生成器 Modal */}
      {reportOpen && (
        <div className="fixed inset-0 z-50 bg-stone-100 overflow-y-auto">
          <div className="max-w-4xl mx-auto p-4 md:p-8 min-h-screen bg-white shadow-2xl">
            <div className="print:hidden mb-8 space-y-4 bg-stone-50 p-6 rounded-3xl border border-stone-200">
              <div className="flex justify-between items-center mb-4"><h2 className="text-xl font-black text-stone-800 flex items-center gap-2"><Filter size={24} className="text-emerald-600"/> Report Filter</h2><button onClick={() => setReportOpen(false)} className="p-2 bg-stone-200 text-stone-600 rounded-full hover:bg-stone-300"><X size={20}/></button></div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div><label className="block text-xs font-bold text-stone-500 uppercase mb-1">Transaction Type</label><select value={filterType} onChange={e => { setFilterType(e.target.value); setFilterCategory('all'); }} className="w-full p-3 rounded-xl border border-stone-200"><option value="all">All Transactions</option><option value="income">Income Only</option><option value="expense">Expense Only</option></select></div>
                <div><label className="block text-xs font-bold text-stone-500 uppercase mb-1">Time Period</label><select value={filterPeriod} onChange={e => setFilterPeriod(e.target.value)} className="w-full p-3 rounded-xl border border-stone-200"><option value="thisMonth">This Month</option><option value="thisYear">This Year</option><option value="all">All Time</option><option value="custom">Custom Range</option></select></div>
                <div><label className="block text-xs font-bold text-stone-500 uppercase mb-1">CRA Category</label><select value={filterCategory} onChange={e => setFilterCategory(e.target.value)} className="w-full p-3 rounded-xl border border-stone-200"><option value="all">All Categories</option>{activeCategories.map(c => <option key={c} value={c}>{c}</option>)}</select></div>
                {filterPeriod === 'custom' && (<div className="md:col-span-3 flex gap-4"><div className="flex-1"><label className="block text-xs font-bold text-stone-500 uppercase mb-1">Start Date</label><input type="date" value={filterStart} onChange={e=>setFilterStart(e.target.value)} className="w-full p-3 rounded-xl border border-stone-200" /></div><div className="flex-1"><label className="block text-xs font-bold text-stone-500 uppercase mb-1">End Date</label><input type="date" value={filterEnd} onChange={e=>setFilterEnd(e.target.value)} className="w-full p-3 rounded-xl border border-stone-200" /></div></div>)}
              </div>
              <button onClick={() => window.print()} className="w-full mt-4 bg-emerald-600 text-white font-bold py-3 rounded-xl flex items-center justify-center gap-2 hover:bg-emerald-700 shadow-md"><Printer size={20}/> Print / Save as PDF</button>
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
             <section className="mb-8">
               <h2 className="text-2xl font-extrabold text-stone-800 mb-4">Capacity Radar</h2>
               <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                 <div className={`p-5 rounded-2xl border-2 text-center ${rosterStats.totalError ? 'bg-red-50 border-red-200' : 'bg-white border-emerald-100'}`}><h3 className="text-sm font-bold uppercase opacity-80 mb-1">Total</h3><div className="text-3xl font-black">{rosterStats.totalCount} <span className="text-lg opacity-60">/ 6</span></div></div>
                 <div className={`p-5 rounded-2xl border-2 text-center ${rosterStats.under3Error ? 'bg-red-50 border-red-200' : 'bg-white border-emerald-100'}`}><h3 className="text-sm font-bold uppercase opacity-80 mb-1">Under 3</h3><div className="text-3xl font-black">{rosterStats.under3Count} <span className="text-lg opacity-60">/ 3</span></div></div>
                 <div className={`p-5 rounded-2xl border-2 text-center ${rosterStats.under2Error ? 'bg-red-50 border-red-200' : 'bg-white border-emerald-100'}`}><h3 className="text-sm font-bold uppercase opacity-80 mb-1">Under 2</h3><div className="text-3xl font-black">{rosterStats.under2Count} <span className="text-lg opacity-60">/ 2</span></div></div>
               </div>
             </section>
             <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
               <section className="lg:col-span-2">
                 <h2 className="text-xl font-extrabold text-stone-800 mb-4">Enrolled Roster</h2>
                 <div className="bg-white rounded-3xl shadow-sm border border-stone-100 overflow-hidden divide-y divide-stone-100">
                   {rosterStats.list.length === 0 ? <p className="p-8 text-center text-stone-400">No children enrolled.</p> : 
                     rosterStats.list.map(child => (
                       <div key={child.id} className="p-5 flex justify-between items-center">
                         <div><h4 className="font-bold text-stone-800">{child.name}</h4><span className="text-sm text-stone-500 mr-2">{child.ageStr}</span>{child.isUnder2 && <span className="bg-amber-100 text-amber-800 text-[10px] px-2 py-0.5 rounded-full uppercase font-bold">Under 2</span>}</div>
                         <button onClick={() => handleRemoveChildClick(child.id, child.name)} className="text-stone-300 hover:text-red-500"><Trash2 size={20}/></button>
                       </div>
                     ))}
                 </div>
               </section>
               <section>
                 <h2 className="text-xl font-extrabold text-stone-800 mb-4">Add Child</h2>
                 <form onSubmit={handleAddChild} className="bg-white p-6 rounded-3xl border border-stone-100 space-y-4">
                   <input type="text" value={newName} onChange={e=>setNewName(e.target.value)} placeholder="First Name" required className="w-full p-3 bg-stone-50 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none"/>
                   <input type="date" value={newDob} onChange={e=>setNewDob(e.target.value)} required className="w-full p-3 bg-stone-50 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none"/>
                   <button type="submit" className="w-full bg-emerald-600 text-white font-bold p-3 rounded-xl hover:bg-emerald-700">Enroll</button>
                 </form>
               </section>
             </div>
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
                  {transactions.length === 0 ? <p className="p-8 text-center text-stone-400">No transactions.</p> : transactions.map(tx => (<div key={tx.id} className="p-4 flex justify-between items-center"><div className="flex gap-4 items-center"><div className={`p-3 rounded-xl ${tx.type === 'income' ? 'bg-emerald-100 text-emerald-600' : 'bg-red-100 text-red-500'}`}>{tx.type === 'income' ? <TrendingUp size={20}/> : <TrendingDown size={20}/>}</div><div><div className="flex items-center gap-2 font-bold text-stone-800">{tx.description} {tx.receiptImage && <a href={tx.receiptImage} target="_blank" className="text-blue-500"><ImageIcon size={16}/></a>}</div><div className="text-xs text-stone-500 flex gap-2 mt-1"><span>{tx.date}</span><span className="bg-stone-100 px-2 py-0.5 rounded-full">{tx.category}</span></div></div></div><div className="flex items-center gap-4"><span className={`font-black text-lg ${tx.type === 'income' ? 'text-emerald-600' : 'text-stone-800'}`}>{tx.type === 'income' ? '+' : '-'}${parseFloat(tx.amount).toFixed(2)}</span><button onClick={()=>handleRemoveTransaction(tx.id, tx.description)} className="text-stone-300 hover:text-red-500"><Trash2 size={20}/></button></div></div>))}
                </div>
              </section>
            </div>
          </div>
        )}

        {/* ================= 模块三：AI 幼教大脑 ================= */}
        {activeTab === 'ai' && (
          <div className="animate-in fade-in duration-300 space-y-8">
            <section className="bg-indigo-600 text-white p-6 md:p-8 rounded-3xl shadow-lg relative overflow-hidden">
              <Sparkles size={120} className="absolute -top-10 -right-10 text-indigo-500 opacity-30" />
              <div className="relative z-10 max-w-2xl">
                <h2 className="text-2xl md:text-3xl font-black mb-2">AI Educator Assistant</h2>
                <p className="text-indigo-100 font-medium mb-6">
                  Gemini reads your current roster's exact ages and generates highly tailored activity plans aligned with the <span className="font-bold text-white">Alberta Flight Framework</span>.
                </p>
                
                <div className="flex flex-col sm:flex-row gap-4">
                  <button 
                    onClick={() => generateAIContent('plan')} 
                    disabled={isGenerating}
                    className="flex-1 bg-white text-indigo-700 font-black py-4 px-6 rounded-2xl flex items-center justify-center gap-2 hover:bg-indigo-50 active:scale-95 transition-all shadow-md disabled:opacity-50"
                  >
                    <Wand2 size={20} />
                    {isGenerating && aiTaskType === 'plan' ? 'Thinking...' : 'Generate Flight Activity Plan'}
                  </button>
                  
                  <button 
                    onClick={() => generateAIContent('report')} 
                    disabled={isGenerating}
                    className="flex-1 bg-indigo-800 text-white font-black py-4 px-6 rounded-2xl flex items-center justify-center gap-2 hover:bg-indigo-900 active:scale-95 transition-all shadow-md disabled:opacity-50"
                  >
                    <MessageCircleHeart size={20} />
                    {isGenerating && aiTaskType === 'report' ? 'Drafting...' : 'Draft Parent Daily Report'}
                  </button>
                </div>
              </div>
            </section>

            {/* AI 结果展示区 */}
            {aiOutput && (
              <section className="bg-white p-6 md:p-8 rounded-3xl shadow-sm border border-stone-200 animate-in slide-in-from-bottom-4 duration-500">
                <div className="flex items-center gap-3 mb-6 border-b border-stone-100 pb-4">
                  <div className="bg-indigo-100 text-indigo-600 p-2 rounded-xl">
                    {aiTaskType === 'plan' ? <Wand2 size={24} /> : <MessageCircleHeart size={24} />}
                  </div>
                  <h3 className="text-xl font-black text-stone-800">
                    {aiTaskType === 'plan' ? "Today's Alberta Flight Activity Plan" : "Draft: Parent Communication"}
                  </h3>
                </div>
                
                {/* 🌟 这里就是渲染出的漂亮排版！ */}
                <div className="prose prose-stone prose-headings:font-black prose-h3:text-indigo-800 prose-a:text-emerald-600 max-w-none text-stone-700 leading-relaxed">
                  <ReactMarkdown>{aiOutput}</ReactMarkdown>
                </div>

                <div className="mt-8 flex justify-end">
                  <button 
                    onClick={() => { navigator.clipboard.writeText(aiOutput); showModal('alert', 'Copied!', 'Text copied to clipboard.'); }} 
                    className="text-sm font-bold bg-stone-100 text-stone-600 px-4 py-2 rounded-xl hover:bg-stone-200 transition-colors"
                  >
                    Copy to Clipboard
                  </button>
                </div>
              </section>
            )}
          </div>
        )}

      </main>
    </div>
  );
}