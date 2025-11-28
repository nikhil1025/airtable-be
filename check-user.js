import mongoose from 'mongoose';
import './src/models';

mongoose.connect('mongodb://localhost:27017/airtable-integration').then(async () => {
  const AirtableConnection = mongoose.model('AirtableConnection');
  const conn = await AirtableConnection.findOne({ userId: 'user_1764150693490' });
  console.log('Has cookies:', !!conn?.cookies);
  if (conn) console.log('Cookie length:', conn.cookies?.length);
  process.exit(0);
});
