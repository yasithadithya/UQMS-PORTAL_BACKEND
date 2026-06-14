import { Request, Response } from 'express';
import mongoose from 'mongoose';
import DocumentTemplate from '../models/DocumentTemplate';

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;

// Get all document templates
export const getAllDocumentTemplates = async (_req: Request, res: Response): Promise<void> => {
  try {
    const documentTemplates = await DocumentTemplate.find().sort({ documentName: 1 });
    res.status(200).json({
      success: true,
      count: documentTemplates.length,
      data: documentTemplates,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: 'Error fetching document templates.',
      error: error.message,
    });
  }
};

// Get document template by ID
export const getDocumentTemplateById = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    if (!mongoose.isValidObjectId(id)) {
      res.status(400).json({
        success: false,
        message: 'Invalid document template ID format.',
      });
      return;
    }

    const documentTemplate = await DocumentTemplate.findById(id);
    if (!documentTemplate) {
      res.status(404).json({
        success: false,
        message: 'Document template not found.',
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: documentTemplate,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: 'Error fetching document template.',
      error: error.message,
    });
  }
};

// Create a new document template
export const createDocumentTemplate = async (req: Request, res: Response): Promise<void> => {
  try {
    const { documentName, documentNumber, revision, effectiveDate, approvedBy } = req.body;

    if (!isNonEmptyString(documentName)) {
      res.status(400).json({
        success: false,
        message: 'Document Name is required.',
      });
      return;
    }

    if (!isNonEmptyString(documentNumber)) {
      res.status(400).json({
        success: false,
        message: 'Document Number is required.',
      });
      return;
    }

    if (!isNonEmptyString(revision)) {
      res.status(400).json({
        success: false,
        message: 'Revision is required.',
      });
      return;
    }

    if (!effectiveDate) {
      res.status(400).json({
        success: false,
        message: 'Effective Date is required.',
      });
      return;
    }

    if (!isNonEmptyString(approvedBy)) {
      res.status(400).json({
        success: false,
        message: 'Approved By is required.',
      });
      return;
    }

    const newDocumentTemplate = new DocumentTemplate({
      documentName: documentName.trim(),
      documentNumber: documentNumber.trim(),
      revision: revision.trim(),
      effectiveDate: new Date(effectiveDate),
      approvedBy: approvedBy.trim(),
    });

    await newDocumentTemplate.save();

    res.status(201).json({
      success: true,
      message: 'Document template created successfully.',
      data: newDocumentTemplate,
    });
  } catch (error: any) {
    if (error.code === 11000) {
      res.status(409).json({
        success: false,
        message: 'Document template with this name already exists.',
        error: error.message,
      });
      return;
    }
    res.status(500).json({
      success: false,
      message: 'Error creating document template.',
      error: error.message,
    });
  }
};

// Update an existing document template
export const updateDocumentTemplate = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { documentName, documentNumber, revision, effectiveDate, approvedBy } = req.body;

    if (!mongoose.isValidObjectId(id)) {
      res.status(400).json({
        success: false,
        message: 'Invalid document template ID format.',
      });
      return;
    }

    const existingDocumentTemplate = await DocumentTemplate.findById(id);
    if (!existingDocumentTemplate) {
      res.status(404).json({
        success: false,
        message: 'Document template not found.',
      });
      return;
    }

    const updates: any = {};

    if (documentName !== undefined) {
      if (!isNonEmptyString(documentName)) {
        res.status(400).json({
          success: false,
          message: 'Document Name cannot be empty.',
        });
        return;
      }
      updates.documentName = documentName.trim();
    }

    if (documentNumber !== undefined) {
      if (!isNonEmptyString(documentNumber)) {
        res.status(400).json({
          success: false,
          message: 'Document Number cannot be empty.',
        });
        return;
      }
      updates.documentNumber = documentNumber.trim();
    }

    if (revision !== undefined) {
      if (!isNonEmptyString(revision)) {
        res.status(400).json({
          success: false,
          message: 'Revision cannot be empty.',
        });
        return;
      }
      updates.revision = revision.trim();
    }

    if (effectiveDate !== undefined) {
      updates.effectiveDate = new Date(effectiveDate);
    }

    if (approvedBy !== undefined) {
      if (!isNonEmptyString(approvedBy)) {
        res.status(400).json({
          success: false,
          message: 'Approved By cannot be empty.',
        });
        return;
      }
      updates.approvedBy = approvedBy.trim();
    }

    const updatedDocumentTemplate = await DocumentTemplate.findByIdAndUpdate(
      id,
      { $set: updates },
      { new: true, runValidators: true }
    );

    res.status(200).json({
      success: true,
      message: 'Document template updated successfully.',
      data: updatedDocumentTemplate,
    });
  } catch (error: any) {
    if (error.code === 11000) {
      res.status(409).json({
        success: false,
        message: 'Document template with this name already exists.',
        error: error.message,
      });
      return;
    }
    res.status(500).json({
      success: false,
      message: 'Error updating document template.',
      error: error.message,
    });
  }
};

// Delete a document template
export const deleteDocumentTemplate = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    if (!mongoose.isValidObjectId(id)) {
      res.status(400).json({
        success: false,
        message: 'Invalid document template ID format.',
      });
      return;
    }

    const deletedDocumentTemplate = await DocumentTemplate.findByIdAndDelete(id);
    if (!deletedDocumentTemplate) {
      res.status(404).json({
        success: false,
        message: 'Document template not found.',
      });
      return;
    }

    res.status(200).json({
      success: true,
      message: 'Document template deleted successfully.',
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: 'Error deleting document template.',
      error: error.message,
    });
  }
};
