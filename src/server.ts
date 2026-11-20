import { app } from './app';

const PORT = process.env.PORT || 4500;

app.listen(PORT, () => {
  console.log(`===================================================`);
  console.log(`🚀 PM Youth CUP Football Server Running`);
  console.log(`🌐 Local URL: http://localhost:${PORT}`);
  console.log(`===================================================`);
});
