import { PrismaClient } from "@prisma/client";

// Standard singleton pattern so Remix's dev server hot-reload doesn't spawn
// a fresh Prisma client (and DB connection) on every file change.
if (process.env.NODE_ENV !== "production") {
  if (!global.prismaGlobal) {
    global.prismaGlobal = new PrismaClient();
  }
}

const prisma = global.prismaGlobal ?? new PrismaClient();

export default prisma;
