import "dotenv/config";
import { MongoClient } from "mongodb";

/**
 * Seeds approved + active services so the home page can show at least six.
 * Safe to re-run: it only creates the missing ones and never duplicates names.
 */
const uri = process.env.MONGODB_URI;
const dbName = process.env.DB_NAME || "wedplan";

if (!uri) {
  throw new Error("MONGODB_URI is required. Copy .env.example to .env first.");
}

const SEEDS = [
  {
    serviceName: "Golden Hour Wedding Photography",
    category: "Photography & Videography",
    description:
      "Candid and cinematic wedding photography with a full-day shoot, edited gallery and a highlight film.",
    price: 85000,
    location: "Gulshan, Dhaka",
    images: ["https://i.ibb.co/Y4870fP9/Featured-Destination.png"],
  },
  {
    serviceName: "Garden Reception Catering",
    category: "Catering Services",
    description:
      "Curated wedding menus with live stations, dessert tables and professional service staff.",
    price: 62000,
    location: "Banani, Dhaka",
    images: ["https://i.ibb.co/Kz9KLTV6/CTA.png"],
  },
  {
    serviceName: "Rose Garden Floral Decor",
    category: "Decoration & Florist",
    description:
      "Floral arches, centrepieces and ambient lighting tailored to your wedding theme.",
    price: 54000,
    location: "Dhanmondi, Dhaka",
    images: ["https://i.ibb.co/twnQhbHY/Frame-2087325669-1.png"],
  },
  {
    serviceName: "Bridal Couture & Styling",
    category: "Makeup & Styling",
    description:
      "Bridal makeup, hair styling and wardrobe styling with a preview session included.",
    price: 28000,
    location: "Uttara, Dhaka",
    images: ["https://i.ibb.co/JWGFSbsJ/Footer.png"],
  },
  {
    serviceName: "Heritage Palace Venue",
    category: "Wedding Venues",
    description:
      "A grand heritage venue with garden ceremony space and indoor reception halls.",
    price: 120000,
    location: "Chattogram",
    images: ["https://i.ibb.co/d4b4L2c4/noorani-database-erd-2.png"],
  },
  {
    serviceName: "Sunset Beach Wedding Package",
    category: "Wedding Fashion",
    description:
      "Complete beach wedding styling with decor, photography and coordination.",
    price: 95000,
    location: "Cox's Bazar",
    images: ["https://i.ibb.co/wZysQMJ4/Testimonials.png"],
  },
];

const client = new MongoClient(uri, {
  maxPoolSize: 5,
  serverSelectionTimeoutMS: 3000,
});

try {
  await client.connect();
  const db = client.db(dbName);
  const collection = db.collection("service");

  const active = await collection.countDocuments({
    status: "approved",
    isAvailable: true,
  });

  if (active >= 6) {
    console.log(`Already ${active} approved + active services. Nothing to seed.`);
  } else {
    const vendor = await db.collection("user").findOne({ role: "vendor" });
    if (!vendor) throw new Error("No vendor account found. Sign up a vendor first.");

    const now = new Date();
    for (const seed of SEEDS.slice(0, 6 - active)) {
      await collection.updateOne(
        { vendorId: vendor._id, serviceName: seed.serviceName },
        {
          $setOnInsert: {
            ...seed,
            vendorId: vendor._id,
            status: "approved",
            isAvailable: true,
            createdAt: now,
            updatedAt: now,
          },
        },
        { upsert: true },
      );
    }

    const total = await collection.countDocuments({
      status: "approved",
      isAvailable: true,
    });
    console.log(`Seeded services. Approved + active count is now ${total}.`);
  }
} finally {
  await client.close();
}
