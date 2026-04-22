import React from 'react';
import MobileDashboard from '../common/MobileDashboard';

const PumpPortal = ({ 
    onOpenBillingSheet,
    onRegisterBiometrics
}) => {
    return (
        <MobileDashboard 
            onOpenBillingSheet={onOpenBillingSheet}
            onRegisterBiometrics={onRegisterBiometrics}
        />
    );
};

export default PumpPortal;
