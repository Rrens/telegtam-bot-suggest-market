import { DEMA } from 'technicalindicators';

const values = Array.from({ length: 200 }, (_, i) => 100 + i);
try {
  const dema50 = DEMA.calculate({ values, period: 50 });
  console.log('DEMA 50 length:', dema50.length);
  
  const dema200 = DEMA.calculate({ values, period: 200 });
  console.log('DEMA 200 length:', dema200.length);
} catch (e) {
  console.error('Error:', e.message);
}
