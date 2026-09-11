import "dotenv/config";
import { EvolutionService } from "../src/lib/services/evolution.service";

async function main() {
  console.log("Verificando conexão com Evolution API...");
  console.log("URL:", process.env.EVOLUTION_API_URL);
  console.log("Instance:", process.env.EVOLUTION_INSTANCE || process.env.EVOLUTION_INSTANCE_NAME);

  const status = await EvolutionService.getInstanceStatus();
  console.log("STATUS DA INSTÂNCIA:", JSON.stringify(status, null, 2));
}

main().catch((err) => {
  console.error("Erro ao verificar Evolution API:", err);
});
