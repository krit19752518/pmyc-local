"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const app_1 = require("./app");
const PORT = process.env.PORT || 4500;
app_1.app.listen(PORT, () => {
    console.log(`===================================================`);
    console.log(`🚀 PM Youth CUP Football Server Running`);
    console.log(`🌐 Local URL: http://localhost:${PORT}`);
    console.log(`===================================================`);
});
