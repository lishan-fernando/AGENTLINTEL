import { orderRepo } from '../data/orderRepo';
export const page = () => orderRepo.all();
