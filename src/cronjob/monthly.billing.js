import cron from 'node-cron';
import { generateMonthlyInvoices } from '../services/invoicesService.js';

// 🕛 Run at midnight (00:00) on the 1st of every month
cron.schedule('0 0 1 * *', async () => {
  console.log('🚀 Running monthly invoice job...');
  try {
    await generateMonthlyInvoices();
  } catch (error) {
    console.error('❌ Cron job failed:', error.message);
  }
});

console.log('✅ Monthly invoice cron job scheduled.');
