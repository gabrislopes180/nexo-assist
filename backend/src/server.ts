import { app } from "./app.js";

const PORT = Number(process.env.PORT) || 8000;

app.listen(PORT, () => {
  console.log(`API rodando em http://localhost:${PORT}`);
});
