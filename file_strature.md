src/
├── app.module.ts
├── main.ts
├── auth/
│   ├── auth.controller.ts
│   ├── auth.module.ts
│   ├── auth.service.ts
│   ├── google.service.ts
│   ├── token.service.ts
│   ├── dto/
│   │   ├── google-login.dto.ts
│   │   ├── password-login.dto.ts
│   │   └── refresh-token.dto.ts
│   └── strategies/
│       └── jwt.strategy.ts
├── categories/
│   ├── categories.controller.ts
│   ├── categories.module.ts
│   ├── categories.service.ts
│   └── dto/
│       └── create-category.dto.ts
├── common/
│   ├── decorators/
│   │   ├── current-user.decorator.ts
│   │   ├── public.decorator.ts
│   │   └── roles.decorator.ts
│   ├── filters/
│   │   └── http-exception.filter.ts
│   └── guards/
│       ├── jwt-auth.guard.ts
│       └── roles.guard.ts
├── matches/
│   ├── matches.controller.ts
│   ├── matches.module.ts
│   └── matches.service.ts
├── offers/
│   ├── offers.controller.ts
│   ├── offers.module.ts
│   ├── offers.service.ts
│   └── dto/
│       ├── create-offer.dto.ts
│       └── offer-action.dto.ts
├── prisma/
│   ├── prisma.module.ts
│   └── prisma.service.ts
├── products/
│   ├── products.controller.ts
│   ├── products.module.ts
│   ├── products.service.ts
│   └── dto/
│       ├── create-product.dto.ts
│       ├── list-products-query.dto.ts
│       └── update-product.dto.ts
├── uploads/
│   ├── uploads.controller.ts
│   └── uploads.module.ts
├── users/
│   ├── users.controller.ts
│   ├── users.module.ts
│   ├── users.service.ts
│   └── dto/
│       └── update-profile.dto.ts
└── wishes/
    ├── wishes.controller.ts
    ├── wishes.module.ts
    ├── wishes.service.ts
    └── dto/
        ├── create-wish.dto.ts
        └── update-wish.dto.ts