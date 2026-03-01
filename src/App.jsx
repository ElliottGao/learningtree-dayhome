import React, { useState, useMemo, useEffect } from 'react';
import { differenceInMonths } from 'date-fns';
import { Baby, Users, AlertCircle, Plus, Trash2, X, Check, Info, DollarSign, TrendingUp, TrendingDown, Receipt, BookOpen, Camera, Image as ImageIcon } from 'lucide-react';
import { collection, onSnapshot, addDoc, deleteDoc, doc } from 'firebase/firestore';
import imageCompression from 'browser-image-compression';
import { db } from './firebase';

// 图片转 Base64 辅助函数
const convertToBase64 = (file) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result);
    reader.onerror = (error) => reject(error);
  });
};

const CustomModal = ({ isOpen, type, title, message, onConfirm, onCancel }) => {
  if (!isOpen) return null;
  const isConfirm = type === 'confirm';
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/40 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden animate-in zoom-in-95 duration-200">
        <div className={`p-6 flex flex-col items-center text-center border-b-4 ${isConfirm ? 'border-amber-500' : 'border-emerald-500'}`}>
          <div className={`p-3 rounded-full mb-4 ${isConfirm ? 'bg-amber-100 text-amber-600' : 'bg-emerald-100 text-emerald-600'}`}>
            {isConfirm ? <AlertCircle size={32} /> : <Info size={32} />}
          </div>
          <h3 className="text-xl font-black text-stone-800 mb-2">{title}</h3>
          <p className="text-stone-500 font-medium leading-relaxed">{message}</p>
        </div>
        <div className="p-4 bg-stone-50 flex gap-3 justify-center">
          {isConfirm && (
            <button onClick={onCancel} className="flex-1 py-3 px-4 rounded-xl font-bold text-stone-600 bg-white border border-stone-200 hover:bg-stone-100 transition-colors">Cancel</button>
          )}
          <button onClick={onConfirm} className={`flex-1 py-3 px-4 rounded-xl font-bold text-white shadow-sm transition-colors flex justify-center items-center gap-2 ${isConfirm ? 'bg-red-500 hover:bg-red-600' : 'bg-emerald-600 hover:bg-emerald-700'}`}>
            {isConfirm ? <Trash2 size={18} /> : <Check size={18} />}
            {isConfirm ? 'Yes, Delete' : 'Got it'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default function App() {
  const [activeTab, setActiveTab] = useState('finance'); // 默认先展示财务方便测试

  const [children, setChildren] = useState([]); 
  const [newName, setNewName] = useState('');
  const [newDob, setNewDob] = useState('');

  const [transactions, setTransactions] = useState([]);
  const [txDate, setTxDate] = useState(new Date().toISOString().split('T')[0]);
  const [txType, setTxType] = useState('income');
  const [txCategory, setTxCategory] = useState('Agent Income');
  const [txDesc, setTxDesc] = useState('');
  const [txAmount, setTxAmount] = useState('');
  
  // 📸 新增：存储压缩后的小票图片
  const [receiptImage, setReceiptImage] = useState(null);
  const [isCompressing, setIsCompressing] = useState(false);

  const [modal, setModal] = useState({ isOpen: false, type: 'alert', title: '', message: '', onConfirm: null });
  const showModal = (type, title, message, onConfirm = null) => {
    setModal({
      isOpen: true, type, title, message,
      onConfirm: () => { if (onConfirm) onConfirm(); setModal({ ...modal, isOpen: false }); },
      onCancel: () => setModal({ ...modal, isOpen: false })
    });
  };

  useEffect(() => {
    const unsubChildren = onSnapshot(collection(db, 'dayhome_children'), (snapshot) => {
      setChildren(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
    const unsubFinance = onSnapshot(collection(db, 'dayhome_finance'), (snapshot) => {
      const txData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      txData.sort((a, b) => new Date(b.date) - new Date(a.date));
      setTransactions(txData);
    });
    return () => { unsubChildren(); unsubFinance(); };
  }, []);

  const rosterStats = useMemo(() => {
    let under2Count = 0; let under3Count = 0;
    const totalCount = children.length;
    const enrichedChildren = children.map(child => {
      const months = differenceInMonths(new Date(), new Date(child.dob));
      if (months < 24) under2Count++; 
      if (months < 36) under3Count++;
      return { ...child, ageStr: `${Math.floor(months / 12)} Y, ${months % 12} M`, isUnder2: months < 24, isUnder3: months < 36 };
    });
    return {
      list: enrichedChildren, totalCount, under2Count, under3Count,
      totalWarning: totalCount >= 6, totalError: totalCount > 6,
      under3Warning: under3Count >= 3, under3Error: under3Count > 3,
      under2Warning: under2Count >= 2, under2Error: under2Count > 2,
    };
  }, [children]);

  const financeStats = useMemo(() => {
    let totalIncome = 0; let totalExpense = 0;
    transactions.forEach(tx => {
      if (tx.type === 'income') totalIncome += parseFloat(tx.amount);
      if (tx.type === 'expense') totalExpense += parseFloat(tx.amount);
    });
    return { totalIncome, totalExpense, netBalance: totalIncome - totalExpense };
  }, [transactions]);

  const handleAddChild = async (e) => {
    e.preventDefault();
    if (!newName || !newDob) return;
    try {
      await addDoc(collection(db, 'dayhome_children'), { name: newName, dob: newDob, addedAt: new Date().toISOString() });
      setNewName(''); setNewDob('');
      showModal('alert', 'Success!', `${newName} has been enrolled.`);
    } catch (error) { showModal('alert', 'Error', 'Failed to save.'); }
  };

  const handleRemoveChildClick = (id, name) => {
    showModal('confirm', 'Remove Child', `Remove ${name} from roster?`, async () => {
      await deleteDoc(doc(db, 'dayhome_children', id));
    });
  };

  // 📸 处理图片上传与极限压缩
  const handleImageUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setIsCompressing(true);
    try {
      // 极限压缩配置：最大 100KB，最大宽高 800px，足够看清小票数字了
      const options = { maxSizeMB: 0.1, maxWidthOrHeight: 800, useWebWorker: true };
      const compressedFile = await imageCompression(file, options);
      const base64Str = await convertToBase64(compressedFile);
      setReceiptImage(base64Str);
    } catch (error) {
      showModal('alert', 'Error', 'Failed to process receipt image.');
    } finally {
      setIsCompressing(false);
    }
  };

  const handleAddTransaction = async (e) => {
    e.preventDefault();
    if (!txAmount || isNaN(txAmount)) {
      showModal('alert', 'Invalid Input', 'Please enter a valid amount.');
      return;
    }
    try {
      await addDoc(collection(db, 'dayhome_finance'), {
        date: txDate, type: txType, category: txCategory,
        description: txDesc || txCategory, amount: parseFloat(txAmount),
        receiptImage: txType === 'expense' ? receiptImage : null, // 仅支出保存小票
        addedAt: new Date().toISOString()
      });
      setTxDesc(''); setTxAmount(''); setReceiptImage(null); // 清空所有输入
      showModal('alert', 'Saved!', 'Transaction recorded successfully.');
    } catch (error) { showModal('alert', 'Error', 'Failed to save transaction.'); }
  };

  const handleRemoveTransaction = (id, desc) => {
    showModal('confirm', 'Delete Record', `Delete transaction: "${desc}"?`, async () => {
      await deleteDoc(doc(db, 'dayhome_finance', id));
    });
  };

  // 🇨🇦 CRA 标准抵扣分类 (完美对齐报税)
  const categoryOptions = txType === 'income' 
    ? ['Agent Income', 'Private Parent Fee', 'Government Subsidy', 'Other Income']
    : ['Food & Beverages (Meals)', 'Toys, Games & Crafts', 'Supplies & Office', 'Maintenance & Repairs', 'Utilities (Heat/Water/Light)', 'Insurance', 'Vehicle / Mileage', 'Other Expenses'];

  const RadarCard = ({ title, count, max, isWarning, isError, icon: Icon }) => (
    <div className={`p-5 rounded-2xl border-2 transition-all shadow-sm flex flex-col items-center justify-center text-center
      ${isError ? 'bg-red-50 border-red-200 text-red-700' : isWarning ? 'bg-amber-50 border-amber-200 text-amber-700' : 'bg-white border-emerald-100 text-emerald-800'}`}>
      <Icon size={28} className={`mb-2 ${isError ? 'text-red-500' : isWarning ? 'text-amber-500' : 'text-emerald-600'}`} />
      <h3 className="text-sm font-bold uppercase tracking-widest opacity-80 mb-1">{title}</h3>
      <div className="text-3xl font-black">{count} <span className="text-lg font-medium opacity-60">/ {max}</span></div>
    </div>
  );

  const StatCard = ({ title, amount, type, icon: Icon }) => {
    const isIncome = type === 'income';
    const isBalance = type === 'balance';
    const colorClass = isIncome ? 'text-emerald-600 bg-emerald-50 border-emerald-100' : 
                       isBalance ? 'text-blue-600 bg-blue-50 border-blue-100' : 'text-red-600 bg-red-50 border-red-100';
    return (
      <div className={`p-5 rounded-2xl border-2 transition-all shadow-sm flex items-center justify-between ${colorClass}`}>
        <div>
          <h3 className="text-xs font-bold uppercase tracking-widest opacity-70 mb-1">{title}</h3>
          <div className="text-3xl font-black">${amount.toFixed(2)}</div>
        </div>
        <div className="p-3 bg-white/50 rounded-full"><Icon size={32} /></div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-stone-50 font-sans text-stone-800 pb-12 relative">
      <CustomModal isOpen={modal.isOpen} type={modal.type} title={modal.title} message={modal.message} onConfirm={modal.onConfirm} onCancel={modal.onCancel} />

      <header className="bg-white border-b-4 border-emerald-500 shadow-sm sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src="/logo_dayhome.png" alt="LearningTree Logo" className="h-12 w-auto drop-shadow-sm" />
            <div>
              <h1 className="text-xl font-black text-amber-900 tracking-tight">LearningTree</h1>
              <p className="text-xs font-bold text-emerald-600 uppercase tracking-widest">Dayhome Hub</p>
            </div>
          </div>
          <div className="flex gap-2 bg-stone-100 p-1 rounded-xl">
            <button onClick={() => setActiveTab('roster')} className={`px-4 py-2 rounded-lg font-bold text-sm transition-all flex items-center gap-2 ${activeTab === 'roster' ? 'bg-white text-emerald-700 shadow-sm' : 'text-stone-500 hover:text-stone-700'}`}>
              <Users size={16} /> Roster
            </button>
            <button onClick={() => setActiveTab('finance')} className={`px-4 py-2 rounded-lg font-bold text-sm transition-all flex items-center gap-2 ${activeTab === 'finance' ? 'bg-white text-emerald-700 shadow-sm' : 'text-stone-500 hover:text-stone-700'}`}>
              <DollarSign size={16} /> Finance
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 mt-8 space-y-8 animate-in fade-in duration-300">
        
        {/* ================= 模块一：人员名单 ================= */}
        {activeTab === 'roster' && (
          <>
            <section>
              <h2 className="text-2xl font-extrabold text-stone-800 mb-4">Capacity Radar</h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <RadarCard title="Total Children" count={rosterStats.totalCount} max={6} isWarning={rosterStats.totalWarning} isError={rosterStats.totalError} icon={Users} />
                <RadarCard title="Under 3 Years" count={rosterStats.under3Count} max={3} isWarning={rosterStats.under3Warning} isError={rosterStats.under3Error} icon={Baby} />
                <RadarCard title="Under 2 Years" count={rosterStats.under2Count} max={2} isWarning={rosterStats.under2Warning} isError={rosterStats.under2Error} icon={Baby} />
              </div>
            </section>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              <section className="lg:col-span-2">
                <h2 className="text-xl font-extrabold text-stone-800 mb-4">Enrolled Roster</h2>
                <div className="bg-white rounded-3xl shadow-sm border border-stone-100 overflow-hidden">
                  <div className="divide-y divide-stone-100">
                    {rosterStats.list.length === 0 ? <p className="p-8 text-center text-stone-400 font-medium">No children enrolled yet.</p> : 
                      rosterStats.list.map(child => (
                        <div key={child.id} className="p-5 flex items-center justify-between hover:bg-stone-50 transition-colors">
                          <div>
                            <h4 className="text-lg font-bold text-stone-800">{child.name}</h4>
                            <div className="flex gap-2 mt-1">
                              <span className="text-sm text-stone-500 font-medium">{child.ageStr}</span>
                              {child.isUnder2 && <span className="bg-amber-100 text-amber-800 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase">Under 2</span>}
                              {child.isUnder3 && !child.isUnder2 && <span className="bg-emerald-100 text-emerald-800 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase">Under 3</span>}
                            </div>
                          </div>
                          <button onClick={() => handleRemoveChildClick(child.id, child.name)} className="p-2 text-stone-300 hover:text-red-500 hover:bg-red-50 rounded-xl transition-colors"><Trash2 size={20} /></button>
                        </div>
                      ))}
                  </div>
                </div>
              </section>

              <section>
                <h2 className="text-xl font-extrabold text-stone-800 mb-4">Add Child</h2>
                <form onSubmit={handleAddChild} className="bg-white p-6 rounded-3xl shadow-sm border border-stone-100 space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-stone-400 uppercase tracking-widest mb-1">First Name</label>
                    <input type="text" value={newName} onChange={e => setNewName(e.target.value)} required className="w-full px-4 py-3 bg-stone-50 border border-stone-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-none font-medium" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-stone-400 uppercase tracking-widest mb-1">Date of Birth</label>
                    <input type="date" value={newDob} onChange={e => setNewDob(e.target.value)} required className="w-full px-4 py-3 bg-stone-50 border border-stone-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-none font-medium" />
                  </div>
                  <button type="submit" className="w-full flex items-center justify-center gap-2 bg-emerald-600 text-white font-bold py-3 px-4 rounded-xl hover:bg-emerald-700 active:scale-95 transition-all shadow-md"><Plus size={18} /> Enroll Child</button>
                </form>
              </section>
            </div>
          </>
        )}

        {/* ================= 模块二：财务管理 ================= */}
        {activeTab === 'finance' && (
          <>
            <section>
              <h2 className="text-2xl font-extrabold text-stone-800 mb-4">Tax & Finance Ledger</h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <StatCard title="Total Income" amount={financeStats.totalIncome} type="income" icon={TrendingUp} />
                <StatCard title="Deductible Expenses" amount={financeStats.totalExpense} type="expense" icon={TrendingDown} />
                <StatCard title="Net Profit" amount={financeStats.netBalance} type="balance" icon={DollarSign} />
              </div>
            </section>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              {/* 左侧：记录表单 */}
              <section>
                <h2 className="text-xl font-extrabold text-stone-800 mb-4">New Entry</h2>
                <form onSubmit={handleAddTransaction} className="bg-white p-6 rounded-3xl shadow-sm border border-stone-100 space-y-4">
                  <div className="flex gap-2 p-1 bg-stone-100 rounded-xl">
                    <button type="button" onClick={() => { setTxType('income'); setTxCategory('Agent Income'); setReceiptImage(null); }} className={`flex-1 py-2 rounded-lg font-bold text-sm transition-all ${txType === 'income' ? 'bg-white text-emerald-600 shadow-sm' : 'text-stone-500 hover:text-stone-700'}`}>Income</button>
                    <button type="button" onClick={() => { setTxType('expense'); setTxCategory('Food & Beverages (Meals)'); }} className={`flex-1 py-2 rounded-lg font-bold text-sm transition-all ${txType === 'expense' ? 'bg-white text-red-600 shadow-sm' : 'text-stone-500 hover:text-stone-700'}`}>Expense</button>
                  </div>
                  
                  <div>
                    <label className="block text-xs font-bold text-stone-400 uppercase tracking-widest mb-1">Date</label>
                    <input type="date" value={txDate} onChange={e => setTxDate(e.target.value)} required className="w-full px-4 py-3 bg-stone-50 border border-stone-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-none font-medium" />
                  </div>
                  
                  <div>
                    <label className="block text-xs font-bold text-stone-400 uppercase tracking-widest mb-1">CRA Tax Category</label>
                    <select value={txCategory} onChange={e => setTxCategory(e.target.value)} className="w-full px-4 py-3 bg-stone-50 border border-stone-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-none font-medium">
                      {categoryOptions.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-stone-400 uppercase tracking-widest mb-1">Note (Optional)</label>
                    <input type="text" value={txDesc} onChange={e => setTxDesc(e.target.value)} placeholder="e.g. Costco Groceries" className="w-full px-4 py-3 bg-stone-50 border border-stone-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-none font-medium" />
                  </div>

                  {/* 📸 仅在记支出时显示“上传收据”按钮 */}
                  {txType === 'expense' && (
                    <div>
                      <label className="block text-xs font-bold text-stone-400 uppercase tracking-widest mb-1">Receipt Image (Optional)</label>
                      <div className="flex items-center gap-3">
                        <label className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 border-2 border-dashed rounded-xl cursor-pointer transition-colors ${receiptImage ? 'border-emerald-300 bg-emerald-50 text-emerald-700' : 'border-stone-300 bg-stone-50 text-stone-500 hover:bg-stone-100'}`}>
                          {isCompressing ? <span className="animate-pulse font-bold">Compressing...</span> : (
                            <>
                              <Camera size={20} />
                              <span className="font-bold text-sm">{receiptImage ? 'Change Photo' : 'Snap Receipt'}</span>
                            </>
                          )}
                          <input type="file" accept="image/*" capture="environment" className="hidden" onChange={handleImageUpload} disabled={isCompressing} />
                        </label>
                        {receiptImage && (
                          <div className="relative h-12 w-12 rounded-lg overflow-hidden border border-stone-200">
                            <img src={receiptImage} alt="receipt thumb" className="h-full w-full object-cover" />
                            <button type="button" onClick={() => setReceiptImage(null)} className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full p-0.5"><X size={10} strokeWidth={4}/></button>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  <div>
                    <label className="block text-xs font-bold text-stone-400 uppercase tracking-widest mb-1">Amount ($)</label>
                    <input type="number" step="0.01" value={txAmount} onChange={e => setTxAmount(e.target.value)} required placeholder="0.00" className="w-full px-4 py-3 text-xl font-black bg-stone-50 border border-stone-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-none" />
                  </div>

                  <button type="submit" disabled={isCompressing} className={`w-full flex items-center justify-center gap-2 text-white font-bold py-3 px-4 rounded-xl active:scale-95 transition-all shadow-md ${txType === 'income' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-red-500 hover:bg-red-600'} ${isCompressing ? 'opacity-50 cursor-not-allowed' : ''}`}>
                    <Plus size={18} /> Save {txType === 'income' ? 'Income' : 'Expense'}
                  </button>
                </form>
              </section>

              {/* 右侧：交易流水 */}
              <section className="lg:col-span-2">
                <h2 className="text-xl font-extrabold text-stone-800 mb-4">Recent Transactions</h2>
                <div className="bg-white rounded-3xl shadow-sm border border-stone-100 overflow-hidden">
                  <div className="divide-y divide-stone-100">
                    {transactions.length === 0 ? <p className="p-8 text-center text-stone-400 font-medium">No transactions recorded yet.</p> : 
                      transactions.map(tx => (
                        <div key={tx.id} className="p-5 flex items-center justify-between hover:bg-stone-50 transition-colors">
                          <div className="flex items-center gap-4">
                            <div className={`p-3 rounded-xl ${tx.type === 'income' ? 'bg-emerald-100 text-emerald-600' : 'bg-red-100 text-red-500'}`}>
                              {tx.type === 'income' ? <TrendingUp size={20} /> : <TrendingDown size={20} />}
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <h4 className="text-lg font-bold text-stone-800">{tx.description}</h4>
                                {/* 📸 显示收据缩略图，点击可查看大图 */}
                                {tx.receiptImage && (
                                  <a href={tx.receiptImage} target="_blank" rel="noreferrer" className="text-blue-500 hover:text-blue-700 bg-blue-50 p-1 rounded-md" title="View Receipt">
                                    <ImageIcon size={16} />
                                  </a>
                                )}
                              </div>
                              <div className="flex gap-2 mt-1">
                                <span className="text-sm text-stone-500 font-medium">{tx.date}</span>
                                <span className="bg-stone-200 text-stone-600 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase">{tx.category}</span>
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-4">
                            <span className={`text-xl font-black ${tx.type === 'income' ? 'text-emerald-600' : 'text-stone-800'}`}>
                              {tx.type === 'income' ? '+' : '-'}${parseFloat(tx.amount).toFixed(2)}
                            </span>
                            <button onClick={() => handleRemoveTransaction(tx.id, tx.description)} className="p-2 text-stone-300 hover:text-red-500 hover:bg-red-50 rounded-xl transition-colors"><Trash2 size={20} /></button>
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
              </section>
            </div>
          </>
        )}
      </main>
    </div>
  );
}