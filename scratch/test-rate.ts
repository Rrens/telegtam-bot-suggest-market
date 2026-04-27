import 'dotenv/config';
import { PriceService } from '../src/services/PriceService';

async function test() {
  const rate = await PriceService.getUsdIdrRate();
  console.log('Real-time USD/IDR rate:', rate);
  process.exit(0);
}

test();
