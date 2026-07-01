import { Request } from 'express';
import { Model, Document, FilterQuery } from 'mongoose';

export interface PaginationResult<T> {
  success: boolean;
  count: number;
  pagination: {
    page: number;
    limit: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPrevPage: boolean;
  };
  data: T[];
}

export async function paginate<T extends Document>(
  model: Model<T>,
  query: FilterQuery<T>,
  req: Request,
  populateOptions: any[] = [],
  sortOptions: any = { createdAt: -1 }
): Promise<PaginationResult<T>> {
  const page = parseInt(req.query.page as string) || 1;
  const limitStr = req.query.limit as string;

  // Allow disabling pagination explicitly with limit=all or limit=-1
  if (limitStr === 'all' || limitStr === '-1') {
    let dbQuery = model.find(query).sort(sortOptions);
    populateOptions.forEach((option) => {
      dbQuery = dbQuery.populate(option) as any;
    });
    const data = await dbQuery;
    return {
      success: true,
      count: data.length,
      pagination: {
        page: 1,
        limit: data.length || 1,
        totalPages: 1,
        hasNextPage: false,
        hasPrevPage: false,
      },
      data,
    };
  }

  const limit = parseInt(limitStr) || 10;
  const skip = (page - 1) * limit;

  const total = await model.countDocuments(query);
  const totalPages = Math.ceil(total / limit) || 1;

  let dbQuery = model.find(query)
    .sort(sortOptions)
    .skip(skip)
    .limit(limit);

  populateOptions.forEach((option) => {
    dbQuery = dbQuery.populate(option) as any;
  });

  const data = await dbQuery;

  return {
    success: true,
    count: total,
    pagination: {
      page,
      limit,
      totalPages,
      hasNextPage: page < totalPages,
      hasPrevPage: page > 1,
    },
    data,
  };
}
